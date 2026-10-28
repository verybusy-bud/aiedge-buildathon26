-- Fresh installation. All writes go through service-only functions after server authentication.
create extension if not exists pgcrypto;
create table public.profiles(id uuid primary key references auth.users on delete cascade,display_name text not null check(length(display_name) between 2 and 40),role text not null default 'member' check(role in ('member','moderator','admin')));
create function public.new_profile() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into profiles(id,display_name) values(new.id,left(coalesce(nullif(new.raw_user_meta_data->>'display_name',''),'Neighbor'),40)); return new; end $$;
create trigger on_signup after insert on auth.users for each row execute function public.new_profile();
create table public.events(id uuid primary key default gen_random_uuid(),title text not null check(length(title) between 8 and 140),category text not null check(category in ('Environment','Roads & transit','Public services','Community','Other')),location text not null check(length(location) between 3 and 120),status text not null default 'open' check(status in ('open','under_review','corroborated','conflicting')),state text not null default 'visible' check(state in ('visible','quarantined','removed')),created_at timestamptz not null default now());
create table public.reports(id uuid primary key default gen_random_uuid(),event_id uuid not null references events on delete cascade,author_id uuid not null references profiles,body text not null check(length(body) between 20 and 4000),observed_at timestamptz not null,assisted boolean not null default false,state text not null default 'visible' check(state in ('visible','quarantined','removed')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,author_id));
create index reports_author_time on reports(author_id,created_at);
create table public.follows(user_id uuid references profiles on delete cascade,event_id uuid references events on delete cascade,created_at timestamptz not null default now(),primary key(user_id,event_id));
create table public.concerns(id uuid primary key default gen_random_uuid(),user_id uuid references profiles on delete set null,event_id uuid not null references events on delete cascade,report_id uuid references reports on delete cascade,reason text not null check(length(reason) between 10 and 2000),kind text not null check(kind in ('flag','appeal')),resolved boolean not null default false,created_at timestamptz not null default now());
create table public.audit(id uuid primary key default gen_random_uuid(),actor_id uuid references profiles on delete set null,event_id uuid references events on delete cascade,action text not null,reason text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
create table public.deletion_requests(id uuid primary key default gen_random_uuid(),user_id uuid unique references profiles on delete set null,state text not null default 'requested',requested_at timestamptz not null default now(),completed_at timestamptz,error text);
alter table profiles enable row level security;
alter table events enable row level security;
alter table reports enable row level security;
alter table follows enable row level security;
alter table concerns enable row level security;
alter table audit enable row level security;
alter table deletion_requests enable row level security;
-- No table policies: browser clients have no direct table access. API projects only safe fields.
revoke all on public.profiles,public.events,public.reports,public.follows,public.concerns,public.audit,public.deletion_requests from anon,authenticated;

create function public.mutate(actor uuid,operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare eid uuid; rid uuid; item uuid; role_name text; target text; result jsonb; begin
 if not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirmed account required'; end if;
 select role into role_name from profiles where id=actor;
 if exists(select 1 from deletion_requests where user_id=actor) and operation <> 'deletion' then raise exception 'Account deletion is pending'; end if;
 if operation in ('create','report') then
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  if (select count(*) from reports where author_id=actor and created_at>now()-interval '24 hours')>=12 then raise exception '12 reports per rolling 24 hours reached'; end if;
  if (payload->>'observed_at')::timestamptz>now()+interval '5 minutes' then raise exception 'Observation cannot be in the future'; end if;
  if operation='create' then insert into events(title,category,location) values(payload->>'title',payload->>'category',payload->>'location') returning id into eid;
  else eid:=(payload->>'event_id')::uuid; if not exists(select 1 from events where id=eid and state='visible') then raise exception 'Event unavailable'; end if; end if;
  insert into reports(event_id,author_id,body,observed_at,assisted) values(eid,actor,payload->>'body',(payload->>'observed_at')::timestamptz,coalesce((payload->>'assisted')::boolean,false)) returning id into rid;
  result:=jsonb_build_object('event_id',eid,'report_id',rid);
 elsif operation='correct' then
  rid:=(payload->>'report_id')::uuid;
  select event_id into eid from reports where id=rid and author_id=actor;
  if eid is null then raise exception 'Report unavailable'; end if;
  insert into audit(actor_id,event_id,action,reason,details) select actor,eid,'correction',payload->>'reason',jsonb_build_object('report_id',rid,'previous_body',body,'previous_observed_at',observed_at) from reports where id=rid;
  if length(coalesce(payload->>'reason',''))<10 then raise exception 'Explain the correction'; end if;
  if (payload->>'observed_at')::timestamptz>now()+interval '5 minutes' then raise exception 'Observation cannot be in the future'; end if;
  update reports set body=payload->>'body',observed_at=(payload->>'observed_at')::timestamptz,assisted=coalesce((payload->>'assisted')::boolean,false),updated_at=now() where id=rid;
  result:=jsonb_build_object('event_id',eid,'report_id',rid);
 elsif operation='follow' then
  eid:=(payload->>'event_id')::uuid;
  if not exists(select 1 from events where id=eid and state='visible') then raise exception 'Event unavailable'; end if;
  if coalesce((payload->>'following')::boolean,false) then insert into follows values(actor,eid,now()) on conflict do nothing; else delete from follows where user_id=actor and event_id=eid; end if;
 elsif operation in ('flag','appeal') then
  eid:=(payload->>'event_id')::uuid;rid:=nullif(payload->>'report_id','')::uuid;
  if rid is not null and not exists(select 1 from reports where id=rid and event_id=eid) then raise exception 'Report does not belong to event'; end if;
  if (select count(*) from concerns where user_id=actor and created_at>now()-interval '24 hours')>=20 then raise exception 'Concern limit reached'; end if;
  insert into concerns(user_id,event_id,report_id,reason,kind) values(actor,eid,rid,payload->>'reason',operation);
 elsif operation='moderate' then
  if coalesce(role_name,'') not in ('admin','moderator') then raise exception 'Moderator access required'; end if;
  eid:=(payload->>'event_id')::uuid;rid:=nullif(payload->>'report_id','')::uuid;target:=payload->>'state';
  if length(coalesce(payload->>'reason',''))<10 or length(coalesce(payload->>'public_notice',''))<10 then raise exception 'A private reason and a user-facing explanation are required'; end if;
  if rid is not null then update reports set state=target,updated_at=now() where id=rid and event_id=eid;
  elsif target in ('visible','quarantined','removed') then update events set state=target where id=eid;
  else update events set status=target where id=eid; end if;
  insert into audit(actor_id,event_id,action,reason,details) values(actor,eid,'moderation',payload->>'reason',jsonb_build_object('report_id',rid,'state',target,'public_notice',payload->>'public_notice'));
  if payload ? 'concern_id' then update concerns set resolved=true where id=(payload->>'concern_id')::uuid and event_id=eid; end if;
 elsif operation='deletion' then insert into deletion_requests(user_id) values(actor) on conflict(user_id) do nothing;
 else raise exception 'Unknown operation'; end if;
 return coalesce(result,'{"ok":true}'::jsonb);
end $$;
revoke all on function public.mutate(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mutate(uuid,text,jsonb) to service_role;
