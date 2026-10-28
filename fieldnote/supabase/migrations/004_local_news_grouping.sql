-- Forward migration: keep migrations 001–003 unchanged on existing installations.
alter table public.events drop constraint events_category_check;
alter table public.events add constraint events_category_check check(category in ('Food & drink','Roads & transit','Special events','Local news','Environment','Public services','Community','Other'));
alter table public.events add column merged_into uuid references public.events(id);

create function public.event_key(value text) returns text language sql immutable set search_path=public as $$
 select trim(regexp_replace(lower(value),'[^a-z0-9]+',' ','g'));
$$;
create index events_grouping_lookup on public.events(event_key(title),event_key(location)) where state='visible';

-- Preserve earlier mutation behavior and grants; the wrapper adds grouping and moderator merges.
alter function public.mutate(uuid,text,jsonb) rename to mutate_before_local_news;
revoke all on function public.mutate_before_local_news(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.mutate(actor uuid,operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare eid uuid; rid uuid; source_id uuid; previous_id uuid; grouped boolean:=false; result jsonb; target_status text;begin
 if operation='report' then
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  previous_id:=(payload->>'event_id')::uuid;
  loop
   select id,merged_into into eid,source_id from events where id=previous_id for update;
   if eid is null then raise exception 'Event unavailable';end if;
   exit when source_id is null;
   previous_id:=source_id;
  end loop;
  return mutate_before_local_news(actor,operation,jsonb_set(payload,'{event_id}',to_jsonb(eid)));
 end if;
 if operation not in ('create','merge') then return mutate_before_local_news(actor,operation,payload);end if;
 if not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirmed account required';end if;
 if exists(select 1 from deletion_requests where user_id=actor) then raise exception 'Account deletion is pending';end if;
 if operation='merge' then
  if not exists(select 1 from profiles where id=actor and role in ('admin','moderator')) then raise exception 'Moderator access required';end if;
  eid:=(payload->>'event_id')::uuid;source_id:=(payload->>'source_event_id')::uuid;
  if eid=source_id then raise exception 'Choose two different events';end if;
  if length(coalesce(payload->>'reason',''))<10 or length(coalesce(payload->>'public_notice',''))<10 then raise exception 'Review reason and witness explanation required';end if;
  -- Stable lock order prevents two moderators from merging the same records in opposite directions.
  perform id from events where id in (eid,source_id) order by id for update;
  if (select count(*) from events where id in(eid,source_id) and state='visible' and merged_into is null)<>2 then raise exception 'Both events must be visible and unmerged';end if;
  if exists(select 1 from reports a join reports b on a.author_id=b.author_id where a.event_id=eid and b.event_id=source_id) then raise exception 'One account reported in both events. Review those reports before grouping; no witness account was discarded';end if;
  select case when exists(select 1 from events where id in(eid,source_id) and status='conflicting') then 'conflicting' else 'under_review' end into target_status;
  update reports set event_id=eid where event_id=source_id;
  insert into follows(user_id,event_id) select user_id,eid from follows where event_id=source_id on conflict do nothing;
  delete from follows where event_id=source_id;
  update concerns set event_id=eid where event_id=source_id;
  update audit set event_id=eid where event_id=source_id;
  update events set state='removed',merged_into=eid where id=source_id;
  update events set status=target_status where id=eid;
  insert into audit(actor_id,event_id,action,reason,details) values(actor,eid,'moderation',payload->>'reason',jsonb_build_object('source_event_id',source_id,'state',target_status,'public_notice',payload->>'public_notice','grouped',true));
  return jsonb_build_object('event_id',eid,'grouped',true);
 end if;

 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if (select count(*) from reports where author_id=actor and created_at>now()-interval '24 hours')>=12 then raise exception '12 reports per rolling 24 hours reached';end if;
 if (payload->>'observed_at')::timestamptz>now()+interval '5 minutes' then raise exception 'Observation cannot be in the future';end if;
 if not coalesce((payload->>'distinct_event')::boolean,false) then
  -- Category is not a grouping key: two witnesses can classify the same event differently.
  perform pg_advisory_xact_lock(hashtextextended(event_key(payload->>'title')||'|'||event_key(payload->>'location'),2));
  select e.id into eid from events e where e.state='visible' and e.merged_into is null
   and event_key(e.title)=event_key(payload->>'title') and event_key(e.location)=event_key(payload->>'location')
   and exists(select 1 from reports r where r.event_id=e.id and r.state='visible'
    and abs(extract(epoch from(r.observed_at-(payload->>'observed_at')::timestamptz)))<=21600)
   order by e.created_at,e.id limit 1 for update;
 end if;
 if eid is not null then
  select id into previous_id from reports where event_id=eid and author_id=actor;
  if previous_id is not null then return jsonb_build_object('event_id',eid,'report_id',previous_id,'already_reported',true,'grouped',true);end if;
  grouped:=true;
 else insert into events(title,category,location) values(payload->>'title',payload->>'category',payload->>'location') returning id into eid;
 end if;
 insert into reports(event_id,author_id,body,observed_at,assisted) values(eid,actor,payload->>'body',(payload->>'observed_at')::timestamptz,coalesce((payload->>'assisted')::boolean,false)) returning id into rid;
 return jsonb_build_object('event_id',eid,'report_id',rid,'grouped',grouped,'already_reported',false);
end $$;
revoke all on function public.mutate(uuid,text,jsonb),public.event_key(text) from public,anon,authenticated;
grant execute on function public.mutate(uuid,text,jsonb) to service_role;
