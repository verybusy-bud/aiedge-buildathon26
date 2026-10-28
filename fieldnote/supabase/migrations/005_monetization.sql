-- Service-only tables. No client roles receive direct access to money, entitlements or ad review.
create table public.billing_customers(user_id uuid references profiles on delete set null,livemode boolean not null,customer_id text primary key,unique(user_id,livemode));
create table public.billing_subscriptions(id text primary key,user_id uuid references profiles on delete set null,customer_id text not null references billing_customers(customer_id),livemode boolean not null,status text not null,price_id text,period_end timestamptz,cancel_at_period_end boolean not null default false,invoice_paid boolean not null default false,refunded boolean not null default false,disputed boolean not null default false,verified_at timestamptz not null);
create index billing_subscriptions_owner on billing_subscriptions(user_id,livemode);
create table public.billing_payments(id text primary key,user_id uuid references profiles on delete set null,customer_id text not null references billing_customers(customer_id),livemode boolean not null,kind text not null check(kind in('contribution','membership')),amount integer not null default 0,currency text not null default 'usd',status text not null,amount_refunded integer not null default 0,payment_intent_id text,verified_at timestamptz not null);
create table public.billing_events(id text primary key,customer_id text not null,event_type text not null,created bigint not null,processed_at timestamptz not null default now());
create table public.commerce_locks(key text primary key,token uuid not null,expires_at timestamptz not null);
create table public.supporter_preferences(user_id uuid primary key references profiles on delete cascade,accent text not null default 'red' check(accent in('red','slate','moss','gold')));
create table public.bookmark_collections(id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles on delete cascade,name text not null check(length(name) between 1 and 60),created_at timestamptz not null default now());
create table public.collection_bookmarks(collection_id uuid not null references bookmark_collections on delete cascade,event_id uuid not null references events on delete cascade,primary key(collection_id,event_id));
create table public.sponsor_applications(id uuid primary key default gen_random_uuid(),user_id uuid references profiles on delete set null,business_name text not null check(length(business_name) between 2 and 120),contact_email text not null,website text not null check(website ~ '^https?://'),proposed_post text not null check(length(proposed_post) between 20 and 4000),assisted boolean not null default false,destination_url text not null check(destination_url ~ '^https?://'),requested_start timestamptz not null,requested_end timestamptz not null,budget text check(length(budget)<=100),state text not null default 'pending' check(state in('pending','approved','rejected')),review_reason text,reviewed_by uuid references profiles on delete set null,created_at timestamptz not null default now(),check(requested_end>requested_start));
create table public.sponsored_placements(id uuid primary key default gen_random_uuid(),application_id uuid not null references sponsor_applications,event_id uuid unique references events on delete set null,primary_report_id uuid references reports on delete set null,sponsor_name text not null,destination_url text not null check(destination_url ~ '^https?://'),starts_at timestamptz not null,ends_at timestamptz not null,pricing_note text not null check(length(pricing_note) between 3 and 300),state text not null default 'draft' check(state in('draft','scheduled','paused','ended')),created_by uuid references profiles on delete set null,created_at timestamptz not null default now(),check(ends_at>starts_at));
create table public.sponsor_audit(id uuid primary key default gen_random_uuid(),actor_id uuid references profiles on delete set null,application_id uuid references sponsor_applications,action text not null,reason text not null,created_at timestamptz not null default now());
do $$ declare t text;begin foreach t in array array['billing_customers','billing_subscriptions','billing_payments','billing_events','commerce_locks','supporter_preferences','bookmark_collections','collection_bookmarks','sponsor_applications','sponsored_placements','sponsor_audit'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);end loop;end $$;

create function public.commerce_claim(lock_key text) returns uuid language plpgsql security definer set search_path=public as $$ declare lease uuid:=gen_random_uuid();begin
 insert into commerce_locks(key,token,expires_at) values(lock_key,lease,now()+interval '3 minutes') on conflict(key) do update set token=excluded.token,expires_at=excluded.expires_at where commerce_locks.expires_at<now();
 if exists(select 1 from commerce_locks where key=lock_key and token=lease) then return lease;end if;return null;
end $$;
create function public.commerce_release(lock_key text,lease uuid) returns void language sql security definer set search_path=public as $$ delete from commerce_locks where key=lock_key and token=lease; $$;
create function public.apply_billing_snapshot(event_id text,event_type text,event_created bigint,cust text,lease uuid,subscriptions jsonb,payments jsonb) returns boolean language plpgsql security definer set search_path=public as $$ declare owner uuid;mode boolean;row jsonb;begin
 perform 1 from commerce_locks where key='customer:'||cust and token=lease and expires_at>now() for update;if not found then raise exception 'Billing lease expired';end if;
 if exists(select 1 from billing_events where id=event_id) then delete from commerce_locks where key='customer:'||cust and token=lease;return false;end if;
 select user_id,livemode into owner,mode from billing_customers where customer_id=cust;if not found then raise exception 'Unknown customer';end if;
 update billing_subscriptions set status='canceled',invoice_paid=false,verified_at=now() where customer_id=cust;
 for row in select value from jsonb_array_elements(subscriptions) loop
  insert into billing_subscriptions(id,user_id,customer_id,livemode,status,price_id,period_end,cancel_at_period_end,invoice_paid,refunded,disputed,verified_at) values(row->>'id',owner,cust,mode,row->>'status',row->>'price_id',(row->>'period_end')::timestamptz,(row->>'cancel_at_period_end')::boolean,(row->>'invoice_paid')::boolean,(row->>'refunded')::boolean,(row->>'disputed')::boolean,now())
  on conflict(id) do update set status=excluded.status,price_id=excluded.price_id,period_end=excluded.period_end,cancel_at_period_end=excluded.cancel_at_period_end,invoice_paid=excluded.invoice_paid,refunded=excluded.refunded,disputed=excluded.disputed,verified_at=now() where billing_subscriptions.customer_id=cust;
 end loop;
 for row in select value from jsonb_array_elements(payments) loop
  insert into billing_payments(id,user_id,customer_id,livemode,kind,amount,currency,status,amount_refunded,payment_intent_id,verified_at) values(row->>'id',owner,cust,mode,row->>'kind',(row->>'amount')::integer,row->>'currency',row->>'status',(row->>'amount_refunded')::integer,row->>'payment_intent_id',now())
  on conflict(id) do update set status=excluded.status,amount_refunded=excluded.amount_refunded,payment_intent_id=excluded.payment_intent_id,verified_at=now() where billing_payments.customer_id=cust;
 end loop;
 insert into billing_events(id,customer_id,event_type,created) values(event_id,cust,event_type,event_created);
 delete from commerce_locks where key='customer:'||cust and token=lease;return true;
end $$;
create function public.supporter_active(actor uuid,mode boolean) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from billing_subscriptions where user_id=actor and livemode=mode and status='active' and invoice_paid and not refunded and not disputed and verified_at is not null and period_end>now()); $$;
create function public.paid_action(actor uuid,mode boolean,operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$ declare cid uuid;begin
 if not supporter_active(actor,mode) then raise exception 'Active Supporter membership required';end if;
 if exists(select 1 from deletion_requests where user_id=actor) then raise exception 'Account deletion pending';end if;
 if operation='accent' then insert into supporter_preferences(user_id,accent) values(actor,payload->>'accent') on conflict(user_id) do update set accent=excluded.accent;
 elsif operation='collection' then if (select count(*) from bookmark_collections where user_id=actor)>=50 then raise exception 'Collection limit reached';end if;insert into bookmark_collections(user_id,name) values(actor,payload->>'name') returning id into cid;
 elsif operation in('bookmark','remove_bookmark','delete_collection') then
  cid:=(payload->>'collection_id')::uuid;if not exists(select 1 from bookmark_collections where id=cid and user_id=actor) then raise exception 'Collection unavailable';end if;
  if operation='bookmark' then if not exists(select 1 from events where id=(payload->>'event_id')::uuid and state='visible') then raise exception 'Event unavailable';end if;insert into collection_bookmarks values(cid,(payload->>'event_id')::uuid) on conflict do nothing;
  elsif operation='remove_bookmark' then delete from collection_bookmarks where collection_id=cid and event_id=(payload->>'event_id')::uuid;
  else delete from bookmark_collections where id=cid;end if;
 else raise exception 'Unknown benefit';end if;return jsonb_build_object('ok',true,'collection_id',cid);
end $$;

create function public.sponsor_action(actor uuid,operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$ declare aid uuid;pid uuid;eid uuid;application sponsor_applications;result jsonb;begin
 if not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirmed account required';end if;
 if exists(select 1 from deletion_requests where user_id=actor) then raise exception 'Account deletion pending';end if;
 if operation='apply' then
  perform pg_advisory_xact_lock(hashtextextended(actor::text,3));
  if (select count(*) from sponsor_applications where user_id=actor and created_at>now()-interval '24 hours')>=5 then raise exception 'Daily application limit reached';end if;
  insert into sponsor_applications(user_id,business_name,contact_email,website,proposed_post,assisted,destination_url,requested_start,requested_end,budget) values(actor,payload->>'business_name',payload->>'contact_email',payload->>'website',payload->>'proposed_post',coalesce((payload->>'assisted')::boolean,false),payload->>'destination_url',(payload->>'requested_start')::timestamptz,(payload->>'requested_end')::timestamptz,payload->>'budget') returning id into aid;return jsonb_build_object('id',aid);
 end if;
 if not exists(select 1 from profiles where id=actor and role='admin') then raise exception 'Administrator access required';end if;
 aid:=(payload->>'application_id')::uuid;select * into application from sponsor_applications where id=aid for update;if application.id is null then raise exception 'Application unavailable';end if;
 if length(coalesce(payload->>'reason',''))<10 then raise exception 'A review reason is required';end if;
 if operation='review' then
  if payload->>'state' not in('approved','rejected') then raise exception 'Invalid decision';end if;
  update sponsor_applications set state=payload->>'state',review_reason=payload->>'reason',reviewed_by=actor where id=aid;
  if payload->>'state'='rejected' then update sponsored_placements set state='paused' where application_id=aid and state<>'ended';end if;
 elsif operation='create_placement' then
  if application.state<>'approved' then raise exception 'Application must be approved first';end if;
  -- The ordinary post/report pipeline applies: same limits, moderation, correction and flagging.
  result:=mutate(actor,'create',jsonb_build_object('title',payload->>'title','category',payload->>'category','location',payload->>'location','body',application.proposed_post,'observed_at',now(),'assisted',application.assisted,'distinct_event',true));eid:=(result->>'event_id')::uuid;
  insert into sponsored_placements(application_id,event_id,primary_report_id,sponsor_name,destination_url,starts_at,ends_at,pricing_note) values(aid,eid,(result->>'report_id')::uuid,application.business_name,application.destination_url,(payload->>'starts_at')::timestamptz,(payload->>'ends_at')::timestamptz,payload->>'pricing_note') returning id into pid;
 elsif operation='placement' then
  if payload->>'state' not in('draft','scheduled','paused','ended') then raise exception 'Invalid placement state';end if;
  if application.state<>'approved' and payload->>'state'='scheduled' then raise exception 'Approved application required';end if;
  if exists(select 1 from sponsored_placements where id=(payload->>'placement_id')::uuid and state='ended') and payload->>'state'<>'ended' then raise exception 'Ended placements cannot restart';end if;
  update sponsored_placements set state=payload->>'state',starts_at=(payload->>'starts_at')::timestamptz,ends_at=(payload->>'ends_at')::timestamptz where id=(payload->>'placement_id')::uuid and application_id=aid;
 else raise exception 'Unknown sponsorship action';end if;
 insert into sponsor_audit(actor_id,application_id,action,reason) values(actor,aid,operation,payload->>'reason');return jsonb_build_object('ok',true,'placement_id',pid,'event_id',eid);
end $$;
do $$ declare signature text;begin foreach signature in array array['commerce_claim(text)','commerce_release(text,uuid)','apply_billing_snapshot(text,text,bigint,text,uuid,jsonb,jsonb)','supporter_active(uuid,boolean)','paid_action(uuid,boolean,text,jsonb)','sponsor_action(uuid,text,jsonb)'] loop execute 'revoke all on function public.'||signature||' from public,anon,authenticated';execute 'grant execute on function public.'||signature||' to service_role';end loop;end $$;

create function public.commerce_event(eid uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',e.id,'title',e.title,'category',e.category,'location',e.location,'status',e.status,'created_at',e.created_at,'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'event_id',r.event_id,'author_id',r.author_id,'display_name',p.display_name,'body',r.body,'observed_at',r.observed_at,'created_at',r.created_at,'assisted',r.assisted,'state',r.state,'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'mime',v.mime,'sha256',v.sha256,'received_at',v.received_at,'preview_path',case when v.preview_path is not null then v.id::text else null end)) from evidence v where v.report_id=r.id),'[]')) order by r.created_at) from reports r join profiles p on p.id=r.author_id where r.event_id=e.id and r.state='visible'),'[]'))||assessment(e.id) from events e where e.id=eid and e.state='visible' and exists(select 1 from reports where event_id=e.id and state='visible');
$$;
create function public.public_sponsorships() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'event_id',p.event_id,'sponsor_name',p.sponsor_name,'destination_url',p.destination_url,'starts_at',p.starts_at,'ends_at',p.ends_at,'state',p.state,'event',commerce_event(p.event_id)) order by p.starts_at,p.id),'[]')
 from sponsored_placements p join sponsor_applications a on a.id=p.application_id join reports primary_report on primary_report.id=p.primary_report_id where primary_report.state='visible' and p.state='scheduled' and a.state='approved' and p.starts_at<=now() and p.ends_at>now() and commerce_event(p.event_id) is not null;
$$;
revoke all on function public.commerce_event(uuid),public.public_sponsorships() from public,anon,authenticated;
grant execute on function public.commerce_event(uuid),public.public_sponsorships() to service_role;

-- Never lose an Advertisement label by grouping paid content into an organic story.
alter function public.mutate(uuid,text,jsonb) rename to mutate_before_commerce;
revoke all on function public.mutate_before_commerce(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.mutate(actor uuid,operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$ begin
 if operation='merge' and exists(select 1 from sponsored_placements where event_id in((payload->>'event_id')::uuid,(payload->>'source_event_id')::uuid)) then raise exception 'Sponsored posts cannot be grouped with organic events';end if;
 return mutate_before_commerce(actor,operation,payload);
end $$;
revoke all on function public.mutate(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mutate(uuid,text,jsonb) to service_role;

alter function public.public_feed() rename to organic_feed_before_commerce;
revoke all on function public.organic_feed_before_commerce() from public,anon,authenticated,service_role;
create function public.public_feed() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(item order by ordinal),'[]') from jsonb_array_elements(organic_feed_before_commerce()) with ordinality as feed(item,ordinal) where not exists(select 1 from sponsored_placements p where p.event_id=(item->>'id')::uuid);
$$;
revoke all on function public.public_feed() from public,anon,authenticated;
grant execute on function public.public_feed() to service_role;
