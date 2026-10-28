insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('evidence-originals','evidence-originals',false,26214400,array['image/jpeg','image/png','image/webp','video/webm','video/mp4']),('evidence-previews','evidence-previews',false,26214400,array['image/webp']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create table public.upload_intents(id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles on delete cascade,report_id uuid not null references reports on delete cascade,object_path text unique not null,expires_at timestamptz not null default now()+interval '2 hours',state text not null default 'pending' check(state in ('pending','complete','cleaned')),created_at timestamptz not null default now());
create table public.evidence(id uuid primary key default gen_random_uuid(),report_id uuid not null references reports on delete cascade,intent_id uuid unique not null references upload_intents,original_path text unique not null,preview_path text,sha256 text not null check(length(sha256)=64),mime text not null,bytes bigint not null check(bytes between 1 and 26214400),received_at timestamptz not null default now(),capture_method text not null default 'browser-camera');
alter table upload_intents enable row level security;
alter table evidence enable row level security;
revoke all on upload_intents,evidence from anon,authenticated;
create function public.prepare_upload(actor uuid,rid uuid) returns jsonb language plpgsql security definer set search_path=public as $$ declare intent uuid:=gen_random_uuid(); path text; expiry timestamptz:=now()+interval '2 hours';begin
 perform pg_advisory_xact_lock(hashtextextended(actor::text,1));
 if not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirmed account required';end if;
 if exists(select 1 from deletion_requests where user_id=actor) then raise exception 'Deletion pending';end if;
 if not exists(select 1 from reports r join events e on e.id=r.event_id where r.id=rid and r.author_id=actor and r.state='visible' and e.state='visible') then raise exception 'Report unavailable';end if;
 if (select count(*) from upload_intents where user_id=actor and created_at>now()-interval '24 hours')>=36 then raise exception 'Daily capture limit reached';end if;
 if (select count(*) from upload_intents where report_id=rid and state<>'cleaned')>=4 then raise exception 'Four captures per report maximum';end if;
 path:=actor::text||'/'||intent::text;
 insert into upload_intents(id,user_id,report_id,object_path,expires_at) values(intent,actor,rid,path,expiry);
 return jsonb_build_object('id',intent,'path',path,'expires_at',expiry);
end $$;
create function public.finish_upload(actor uuid,iid uuid,hash text,media_type text,size_bytes bigint,preview text) returns uuid language plpgsql security definer set search_path=public as $$ declare i upload_intents; eid uuid;begin
 select * into i from upload_intents where id=iid and user_id=actor for update;
 if i.id is null or i.state<>'pending' or i.expires_at<now() then raise exception 'Upload expired or already finalized';end if;
 if exists(select 1 from deletion_requests where user_id=actor) then raise exception 'Deletion pending';end if;
 if not exists(select 1 from reports r join events e on e.id=r.event_id where r.id=i.report_id and r.author_id=actor and r.state='visible' and e.state='visible') then raise exception 'Report unavailable';end if;
 insert into evidence(report_id,intent_id,original_path,preview_path,sha256,mime,bytes) values(i.report_id,i.id,i.object_path,preview,hash,media_type,size_bytes) returning id into eid;
 update upload_intents set state='complete' where id=i.id;
 return eid;
end $$;
create or replace function public.assessment(eid uuid) returns jsonb language sql stable security definer set search_path=public as $$
 with r as(select count(distinct author_id) n,max(created_at) latest from reports where event_id=eid and state='visible'), c as(select count(distinct v.sha256) n from evidence v join reports r on r.id=v.report_id where r.event_id=eid and r.state='visible'), f as(select r.n,r.latest,jsonb_build_object('accounts',case when r.n>=3 then 2 when r.n=2 then 1 else 0 end,'provenance',least(c.n*.5,1),'recency',case when r.latest>=now()-interval '6 hours' then 1 when r.latest>=now()-interval '24 hours' then .5 else 0 end,'moderator',case when e.status='corroborated' then 1 else 0 end,'conflict',case when e.status='conflicting' then -1 else 0 end) factors from r cross join c cross join events e where e.id=eid and e.state='visible')
 select jsonb_build_object('score',case when n=0 then null else greatest(0,least(5,(select sum(value::numeric) from jsonb_each_text(factors)))) end,'factors',factors,'latest_report_at',latest) from f;
$$;
create function public.public_feed() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(row_data order by (row_data->>'score')::numeric desc nulls last,(row_data->>'latest_report_at')::timestamptz desc nulls last,row_data->>'id'),'[]') from (
 select jsonb_build_object('id',e.id,'title',e.title,'category',e.category,'location',e.location,'status',e.status,'created_at',e.created_at,'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'event_id',r.event_id,'author_id',r.author_id,'display_name',p.display_name,'body',r.body,'observed_at',r.observed_at,'created_at',r.created_at,'assisted',r.assisted,'state',r.state,'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'mime',v.mime,'sha256',v.sha256,'received_at',v.received_at,'preview_path',case when v.preview_path is not null then v.id::text else null end)) from evidence v where v.report_id=r.id),'[]')) order by r.created_at) from reports r join profiles p on p.id=r.author_id where r.event_id=e.id and r.state='visible'),'[]'))||assessment(e.id) row_data from events e where e.state='visible' order by e.created_at desc limit 200
 ) safe;
$$;
revoke all on function public_feed(),prepare_upload(uuid,uuid),finish_upload(uuid,uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public_feed(),prepare_upload(uuid,uuid),finish_upload(uuid,uuid,text,text,bigint,text) to service_role;
-- Record immediate score changes. Timed changes are recorded by the protected maintenance endpoint.
create function public.assessment_changed() returns trigger language plpgsql security definer set search_path=public as $$ begin perform record_assessments();return null;end $$;
create trigger report_assessment after insert or update or delete on reports for each statement execute function assessment_changed();
create trigger event_assessment after update on events for each statement execute function assessment_changed();
create trigger evidence_assessment after insert or delete on evidence for each statement execute function assessment_changed();
