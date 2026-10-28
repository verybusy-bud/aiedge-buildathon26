create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  created_at timestamptz not null default now()
);

create table if not exists public.moderator_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);

create or replace function public.is_verified_user()
returns boolean language sql stable security definer set search_path = auth, public
as $$ select exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null); $$;

create or replace function public.is_fieldnote_moderator()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.moderator_roles where user_id = auth.uid()); $$;

revoke all on function public.is_verified_user() from public;
revoke all on function public.is_fieldnote_moderator() from public;
grant execute on function public.is_verified_user() to authenticated;
grant execute on function public.is_fieldnote_moderator() to authenticated;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  category text not null check (category in ('Road & transit','Weather & hazards','Traffic','Community event','Public service','Other')),
  title text not null check (char_length(title) between 5 and 120),
  location_label text not null check (char_length(location_label) between 2 and 120),
  approximate_lat double precision,
  approximate_lng double precision,
  observed_at timestamptz not null,
  status text not null default 'single_report' check (status in ('single_report','independence_under_review','conflicting','corroborated','unresolved','moderator_review')),
  visibility text not null default 'public' check (visibility in ('public','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((approximate_lat is null and approximate_lng is null) or (approximate_lat between -90 and 90 and approximate_lng between -180 and 180))
);

create table if not exists public.witness_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  observation text not null check (char_length(observation) between 10 and 2000),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists witness_reports_event_created_idx on public.witness_reports(event_id, created_at);
create index if not exists events_created_idx on public.events(created_at desc) where visibility = 'public';

create table if not exists public.report_revisions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.witness_reports(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  revision_text text not null check (char_length(revision_text) between 10 and 2000),
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.evidence (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.witness_reports(id) on delete cascade,
  uploader_id uuid references auth.users(id) on delete set null,
  original_path text not null unique,
  preview_path text,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','video/webm','video/mp4')),
  byte_length bigint not null check (byte_length > 0 and byte_length <= 26214400),
  client_captured_at timestamptz,
  server_received_at timestamptz not null default now(),
  integrity_status text not null default 'hash_recorded' check (integrity_status in ('hash_recorded','preview_sanitized','review_required')),
  created_at timestamptz not null default now()
);

create table if not exists public.event_flags (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null check (char_length(reason) between 5 and 500),
  status text not null default 'open' check (status in ('open','reviewing','resolved')),
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_audit (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid references auth.users(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  flag_id uuid references public.event_flags(id) on delete set null,
  action text not null check (action in ('under_review','corrected','removed','restored','resolved','appeal_received')),
  reason text not null check (char_length(reason) between 5 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.event_appeals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  appellant_id uuid references auth.users(id) on delete set null,
  reason text not null check (char_length(reason) between 10 and 1500),
  status text not null default 'open' check (status in ('open','reviewing','resolved')),
  created_at timestamptz not null default now()
);

create table if not exists public.event_follows (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id,user_id)
);

create table if not exists public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','completed'))
);

create or replace function public.guard_report_rate()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  if (select count(*) from public.witness_reports where user_id = new.user_id and created_at > now() - interval '24 hours') >= 12 then
    raise exception 'report_limit_reached';
  end if;
  return new;
end;
$$;
drop trigger if exists witness_report_rate_limit on public.witness_reports;
create trigger witness_report_rate_limit before insert on public.witness_reports for each row execute function public.guard_report_rate();

create or replace function public.create_event_report(
  p_category text, p_title text, p_location_label text, p_observed_at timestamptz,
  p_observation text, p_approximate_lat double precision default null, p_approximate_lng double precision default null
) returns uuid language plpgsql security invoker set search_path = public
as $$
declare new_event_id uuid;
begin
  if auth.uid() is null or not public.is_verified_user() then raise exception 'verified_account_required'; end if;
  insert into public.events(created_by,category,title,location_label,observed_at,approximate_lat,approximate_lng)
  values(auth.uid(),p_category,p_title,p_location_label,p_observed_at,p_approximate_lat,p_approximate_lng)
  returning id into new_event_id;
  insert into public.witness_reports(event_id,user_id,observation,observed_at)
  values(new_event_id,auth.uid(),p_observation,p_observed_at);
  return new_event_id;
end;
$$;

create or replace function public.add_witness_report(p_event_id uuid,p_observation text,p_observed_at timestamptz)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_report_id uuid;
begin
  if auth.uid() is null or not public.is_verified_user() then raise exception 'verified_account_required'; end if;
  if not exists(select 1 from public.events where id=p_event_id and visibility='public') then raise exception 'event_unavailable'; end if;
  insert into public.witness_reports(event_id,user_id,observation,observed_at)
  values(p_event_id,auth.uid(),p_observation,p_observed_at) returning id into new_report_id;
  update public.events set status='independence_under_review', updated_at=now()
  where id=p_event_id and status='single_report';
  return new_report_id;
end;
$$;

create or replace function public.apply_moderation_action(p_event_id uuid,p_flag_id uuid,p_action text,p_reason text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_fieldnote_moderator() then raise exception 'moderator_required'; end if;
  if p_action not in ('under_review','corrected','removed','restored','resolved') then raise exception 'invalid_action'; end if;
  if p_event_id is not null then
    update public.events set
      visibility=case when p_action='removed' then 'removed' when p_action='restored' then 'public' else visibility end,
      status=case when p_action='under_review' then 'moderator_review' when p_action='resolved' then 'unresolved' else status end,
      updated_at=now()
    where id=p_event_id;
  end if;
  if p_flag_id is not null then update public.event_flags set status='resolved' where id=p_flag_id; end if;
  insert into public.moderation_audit(moderator_id,event_id,flag_id,action,reason)
  values(auth.uid(),p_event_id,p_flag_id,p_action,p_reason);
end;
$$;

alter table public.profiles enable row level security;
alter table public.moderator_roles enable row level security;
alter table public.events enable row level security;
alter table public.witness_reports enable row level security;
alter table public.report_revisions enable row level security;
alter table public.evidence enable row level security;
alter table public.event_flags enable row level security;
alter table public.moderation_audit enable row level security;
alter table public.event_appeals enable row level security;
alter table public.event_follows enable row level security;
alter table public.account_deletion_requests enable row level security;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id,display_name)
  values(new.id,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),split_part(new.email,'@',1)));
  return new;
end;
$$;

drop trigger if exists profiles_create_after_signup on auth.users;
create trigger profiles_create_after_signup after insert on auth.users
for each row execute function public.handle_new_user();

create policy "public display names" on public.profiles for select using (true);
create policy "profile owner updates display name" on public.profiles for update using (id=auth.uid()) with check (id=auth.uid());
create policy "users read own moderator role" on public.moderator_roles for select to authenticated using (user_id=auth.uid());
create policy "read public events" on public.events for select using (visibility='public' or public.is_fieldnote_moderator());
create policy "verified users create events" on public.events for insert to authenticated with check (created_by=auth.uid() and public.is_verified_user());
create policy "moderators update events" on public.events for update to authenticated using (public.is_fieldnote_moderator()) with check (public.is_fieldnote_moderator());
create policy "verified event owner adds witness report" on public.witness_reports for insert to authenticated with check (user_id=auth.uid() and public.is_verified_user() and exists(select 1 from public.events e where e.id=event_id and e.visibility='public'));
create policy "read reports on public events" on public.witness_reports for select using (exists(select 1 from public.events e where e.id=event_id and (e.visibility='public' or public.is_fieldnote_moderator())));
create policy "read report revisions on visible events" on public.report_revisions for select using (exists(select 1 from public.witness_reports r join public.events e on e.id=r.event_id where r.id=report_id and (e.visibility='public' or public.is_fieldnote_moderator())));
create policy "verified author corrects own report" on public.report_revisions for insert to authenticated with check (user_id=auth.uid() and public.is_verified_user() and exists(select 1 from public.witness_reports r where r.id=report_id and r.user_id=auth.uid()));
create policy "submitters and moderators read evidence metadata" on public.evidence for select using (uploader_id=auth.uid() or public.is_fieldnote_moderator());
create policy "evidence uploader can insert metadata" on public.evidence for insert to authenticated with check (uploader_id=auth.uid() and public.is_verified_user() and exists(select 1 from public.witness_reports r where r.id=report_id and r.user_id=auth.uid()));
create policy "verified users flag public events" on public.event_flags for insert to authenticated with check (reporter_id=auth.uid() and public.is_verified_user() and exists(select 1 from public.events e where e.id=event_id and e.visibility='public'));
create policy "moderators read flags" on public.event_flags for select to authenticated using (public.is_fieldnote_moderator());
create policy "moderators resolve flags" on public.event_flags for update to authenticated using (public.is_fieldnote_moderator()) with check (public.is_fieldnote_moderator());
create policy "moderators read audit" on public.moderation_audit for select to authenticated using (public.is_fieldnote_moderator());
create policy "moderators create audit" on public.moderation_audit for insert to authenticated with check (moderator_id=auth.uid() and public.is_fieldnote_moderator());
create policy "verified users appeal visible events" on public.event_appeals for insert to authenticated with check (appellant_id=auth.uid() and public.is_verified_user());
create policy "users read own appeals moderators read all" on public.event_appeals for select to authenticated using (appellant_id=auth.uid() or public.is_fieldnote_moderator());
create policy "users manage own follows" on public.event_follows for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid() and public.is_verified_user());
create policy "users request own deletion" on public.account_deletion_requests for insert to authenticated with check (user_id=auth.uid());
create policy "users view own deletion request" on public.account_deletion_requests for select to authenticated using (user_id=auth.uid());

grant select on public.profiles,public.events,public.witness_reports,public.report_revisions,public.evidence to anon,authenticated;
grant select,update on public.profiles to authenticated;
grant select on public.moderator_roles to authenticated;
grant select,insert,update on public.events to authenticated;
grant select,insert on public.witness_reports,public.report_revisions,public.event_flags,public.event_appeals to authenticated;
grant update on public.event_flags to authenticated;
grant select,insert on public.evidence to authenticated;
grant select,insert,delete on public.event_follows to authenticated;
grant select on public.moderation_audit to authenticated;
grant execute on function public.create_event_report(text,text,text,timestamptz,text,double precision,double precision) to authenticated;
grant execute on function public.add_witness_report(uuid,text,timestamptz) to authenticated;
grant execute on function public.apply_moderation_action(uuid,uuid,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('evidence-originals','evidence-originals',false,26214400,array['image/jpeg','image/png','image/webp','video/webm','video/mp4']),
       ('evidence-previews','evidence-previews',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "owners upload originals to own folder" on storage.objects for insert to authenticated
with check (bucket_id='evidence-originals' and (storage.foldername(name))[1]=auth.uid()::text and public.is_verified_user());
create policy "owners read originals; moderators review" on storage.objects for select to authenticated
using (bucket_id='evidence-originals' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_fieldnote_moderator()));
create policy "owners upload sanitized preview to own folder" on storage.objects for insert to authenticated
with check (bucket_id='evidence-previews' and (storage.foldername(name))[1]=auth.uid()::text and public.is_verified_user());
create policy "read sanitized previews for public events" on storage.objects for select to anon,authenticated
using (bucket_id='evidence-previews' and (
  (storage.foldername(name))[1]=auth.uid()::text or public.is_fieldnote_moderator() or exists (
    select 1 from public.evidence ev join public.witness_reports wr on wr.id=ev.report_id join public.events e on e.id=wr.event_id
    where ev.preview_path=name and e.visibility='public'
  )
));
