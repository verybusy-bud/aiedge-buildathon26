-- A small, explainable assessment. It is not a probability or truth judgment.
alter table public.events
  add column if not exists assessment_score numeric(2,1) not null default 0 check (assessment_score between 0 and 5),
  add column if not exists assessment_factors jsonb not null default '{}'::jsonb;
alter table public.events alter column assessment_score drop not null;

create table if not exists public.assessment_history (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  old_score numeric(2,1) not null,
  new_score numeric(2,1) not null,
  factors jsonb not null,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.assessment_history alter column old_score drop not null;
alter table public.assessment_history alter column new_score drop not null;
alter table public.assessment_history enable row level security;
create policy "public read assessment history for visible events" on public.assessment_history
  for select using (exists(select 1 from public.events e where e.id=event_id and (e.visibility='public' or public.is_fieldnote_moderator())));
grant select on public.assessment_history to anon,authenticated;
grant execute on function public.is_fieldnote_moderator() to anon,authenticated;
alter table public.moderation_audit drop constraint if exists moderation_audit_action_check;
alter table public.moderation_audit add constraint moderation_audit_action_check
  check (action in ('under_review','corroborated','conflicting','corrected','removed','restored','resolved','appeal_received'));

create or replace function public.apply_moderation_action(p_event_id uuid,p_flag_id uuid,p_action text,p_reason text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_fieldnote_moderator() then raise exception 'moderator_required'; end if;
  if p_action not in ('under_review','corroborated','conflicting','corrected','removed','restored','resolved') then raise exception 'invalid_action'; end if;
  if char_length(p_reason)<5 or char_length(p_reason)>1000 then raise exception 'invalid_reason'; end if;
  if p_event_id is not null then
    update public.events set
      visibility=case when p_action='removed' then 'removed' when p_action='restored' then 'public' else visibility end,
      status=case when p_action='under_review' then 'moderator_review' when p_action='corroborated' then 'corroborated' when p_action='conflicting' then 'conflicting' when p_action='resolved' then 'unresolved' else status end,
      updated_at=now()
    where id=p_event_id;
  end if;
  if p_flag_id is not null then update public.event_flags set status='resolved' where id=p_flag_id; end if;
  insert into public.moderation_audit(moderator_id,event_id,flag_id,action,reason)
  values(auth.uid(),p_event_id,p_flag_id,p_action,p_reason);
end;
$$;

create or replace function public.refresh_event_assessment(p_event_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  account_count integer;
  evidence_count integer;
  latest_report timestamptz;
  event_status text;
  account_points numeric(2,1);
  evidence_points numeric(2,1);
  recency_points numeric(2,1);
  moderator_points numeric(2,1);
  conflict_penalty numeric(2,1);
  next_score numeric(2,1);
  factors jsonb;
  previous_score numeric(2,1);
  previous_factors jsonb;
begin
  select status,assessment_score,assessment_factors into event_status,previous_score,previous_factors
    from public.events where id=p_event_id for update;
  if not found then return; end if;
  select count(distinct user_id),coalesce(max(created_at),now()) into account_count,latest_report
    from public.witness_reports where event_id=p_event_id and user_id is not null;
  select count(*) into evidence_count
    from public.evidence ev join public.witness_reports wr on wr.id=ev.report_id
    where wr.event_id=p_event_id and ev.integrity_status in ('hash_recorded','preview_sanitized');
  account_points:=case when account_count>=3 then 2 when account_count>=2 then 1 else 0 end;
  evidence_points:=least(1.0,evidence_count*0.5)::numeric(2,1);
  recency_points:=case when account_count=0 then 0 when now()-latest_report<=interval '6 hours' then 1 when now()-latest_report<=interval '24 hours' then 0.5 else 0 end;
  moderator_points:=case when event_status='corroborated' then 1 else 0 end;
  conflict_penalty:=case when event_status='conflicting' then 1 else 0 end;
  next_score:=case when account_count=0 then null else greatest(0,least(5,account_points+evidence_points+recency_points+moderator_points-conflict_penalty)) end;
  factors:=jsonb_build_object(
    'distinct_accounts_points',account_points,
    'capture_provenance_points',evidence_points,
    'recency_points',recency_points,
    'moderator_review_points',moderator_points,
    'conflict_penalty',conflict_penalty,
    'distinct_account_count',account_count,
    'eligible_capture_count',evidence_count,
    'note','Distinct accounts do not prove independent sources; capture checks do not prove event truth.'
  );
  update public.events set assessment_score=next_score,assessment_factors=factors,updated_at=now() where id=p_event_id;
  if previous_score is distinct from next_score or previous_factors is distinct from factors then
    insert into public.assessment_history(event_id,old_score,new_score,factors,reason)
    values(p_event_id,previous_score,next_score,factors,'Recalculated from server-recorded reports, evidence, recency, and moderation status.');
  end if;
end;
$$;

create or replace function public.refresh_assessment_from_report()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  if tg_op='DELETE' then perform public.refresh_event_assessment(old.event_id); return old; end if;
  perform public.refresh_event_assessment(new.event_id);
  return new;
end; $$;
create or replace function public.refresh_assessment_from_evidence()
returns trigger language plpgsql security definer set search_path = public
as $$ declare target_event uuid; begin
  if tg_op='DELETE' then select event_id into target_event from public.witness_reports where id=old.report_id;
  else select event_id into target_event from public.witness_reports where id=new.report_id; end if;
  if target_event is not null then perform public.refresh_event_assessment(target_event); end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
create or replace function public.refresh_assessment_from_status()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  if new.status is distinct from old.status then perform public.refresh_event_assessment(new.id); end if;
  return new;
end; $$;

drop trigger if exists assessment_after_report_change on public.witness_reports;
create trigger assessment_after_report_change after insert or update or delete on public.witness_reports
for each row execute function public.refresh_assessment_from_report();
drop trigger if exists assessment_after_evidence_change on public.evidence;
create trigger assessment_after_evidence_change after insert or update or delete on public.evidence
for each row execute function public.refresh_assessment_from_evidence();
drop trigger if exists assessment_after_moderator_status on public.events;
create trigger assessment_after_moderator_status after update of status on public.events
for each row execute function public.refresh_assessment_from_status();

revoke all on function public.refresh_event_assessment(uuid) from public,anon,authenticated;
revoke all on function public.refresh_assessment_from_report() from public,anon,authenticated;
revoke all on function public.refresh_assessment_from_evidence() from public,anon,authenticated;
revoke all on function public.refresh_assessment_from_status() from public,anon,authenticated;

-- Existing rows also receive a calculated score.
do $$ declare event_row record; begin
  for event_row in select id from public.events loop
    perform public.refresh_event_assessment(event_row.id);
  end loop;
end; $$;
