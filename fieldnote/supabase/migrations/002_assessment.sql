create table public.assessment_history(id bigint generated always as identity primary key,event_id uuid not null references events on delete cascade,score numeric,factors jsonb not null,recorded_at timestamptz not null default now());
alter table assessment_history enable row level security;
revoke all on assessment_history from anon,authenticated;
-- Capture count is added by migration 003; this function is replaced there.
create function public.assessment(eid uuid) returns jsonb language sql stable security definer set search_path=public as $$
 with r as(select count(distinct author_id) n,max(created_at) latest from reports where event_id=eid and state='visible'), f as(select n,latest,jsonb_build_object('accounts',case when n>=3 then 2 when n=2 then 1 else 0 end,'provenance',0,'recency',case when latest>=now()-interval '6 hours' then 1 when latest>=now()-interval '24 hours' then .5 else 0 end,'moderator',case when e.status='corroborated' then 1 else 0 end,'conflict',case when e.status='conflicting' then -1 else 0 end) factors from r cross join events e where e.id=eid)
 select jsonb_build_object('score',case when n=0 then null else greatest(0,least(5,(select sum(value::numeric) from jsonb_each_text(factors)))) end,'factors',factors,'latest_report_at',latest) from f;
$$;
create function public.record_assessments() returns void language plpgsql security definer set search_path=public as $$ begin
 insert into assessment_history(event_id,score,factors)
 select e.id,(a->>'score')::numeric,a->'factors' from events e cross join lateral assessment(e.id) a
 where a is not null and not exists(select 1 from assessment_history h where h.id=(select max(h2.id) from assessment_history h2 where h2.event_id=e.id) and h.score is not distinct from (a->>'score')::numeric and h.factors=a->'factors');
end $$;
revoke all on function assessment(uuid),record_assessments() from public,anon,authenticated;
grant execute on function assessment(uuid),record_assessments() to service_role;
