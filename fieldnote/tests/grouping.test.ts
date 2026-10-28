import { test } from 'node:test';import assert from 'node:assert/strict';import { PGlite } from '@electric-sql/pglite';import { readFile } from 'node:fs/promises';

test('Exact matches group once, different occurrences stay separate, and moderators can combine listings',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for(const file of ['001_core.sql','002_assessment.sql','003_private_uploads.sql','004_local_news_grouping.sql','005_monetization.sql'])await db.exec((await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;',''));
  const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
  for(const id of ids)await db.query('insert into auth.users values($1,now(),$2)',[id,JSON.stringify({display_name:'Witness'})]);
  const mutate=async(actor:string,operation:string,payload:object)=>(await db.query<{v:any}>('select mutate($1,$2,$3) v',[actor,operation,JSON.stringify(payload)])).rows[0].v;
  const observation={title:'Lane closure near 8th and Phillips',location:'Downtown 8th Street',category:'Roads & transit',body:'I saw cones and traffic moving in one lane.',observed_at:new Date().toISOString(),assisted:false};
  const first=await mutate(ids[0],'create',observation);
  const second=await mutate(ids[1],'create',{...observation,title:'LANE CLOSURE near 8th and Phillips!',category:'Local news'});
  assert.equal(second.event_id,first.event_id);assert.equal(second.grouped,true);
  const repeat=await mutate(ids[1],'create',observation);assert.equal(repeat.already_reported,true);assert.equal(repeat.report_id,second.report_id);
  assert.equal((await db.query('select * from reports')).rows.length,2);
  const assessment=(await db.query<{v:any}>('select assessment($1) v',[first.event_id])).rows[0].v;assert.equal(assessment.factors.accounts,1);
  const distinct=await mutate(ids[2],'create',{...observation,distinct_event:true});assert.notEqual(distinct.event_id,first.event_id);
  const intent=(await db.query<{v:any}>('select prepare_upload($1,$2) v',[ids[2],distinct.report_id])).rows[0].v;
  await db.query('select finish_upload($1,$2,$3,$4,$5,$6)',[ids[2],intent.id,'b'.repeat(64),'image/jpeg',100,null]);
  const old=await mutate(ids[2],'create',{...observation,observed_at:new Date(Date.now()-48*3600000).toISOString()});assert.notEqual(old.event_id,first.event_id);
  const hidden=await mutate(ids[2],'create',{...observation,title:'Food trucks gathering near the park',category:'Food & drink',location:'Falls Park'});
  await db.query("update profiles set role='moderator' where id=$1",[ids[2]]);
  await mutate(ids[2],'moderate',{event_id:hidden.event_id,state:'quarantined',reason:'Review this location carefully.',public_notice:'This event is under review.'});
  const separate=await mutate(ids[0],'create',{...observation,title:'Food trucks gathering near the park',category:'Food & drink',location:'Falls Park'});assert.notEqual(separate.event_id,hidden.event_id);
  const merge={event_id:first.event_id,source_event_id:distinct.event_id,reason:'Reviewed reports and confirmed the same occurrence.',public_notice:'These reports have been grouped under one local event.'};
  await assert.rejects(()=>mutate(ids[0],'merge',merge),/Moderator access/);
  await mutate(ids[1],'follow',{event_id:distinct.event_id,following:true});
  await mutate(ids[2],'merge',merge);
  const grouped=(await db.query<{v:any}>('select public_feed() v')).rows[0].v.find((e:any)=>e.id===first.event_id);
  assert.equal(grouped.reports.length,3);assert.equal(grouped.factors.accounts,2);assert.equal(grouped.status,'under_review');
  assert.equal(grouped.factors.provenance,.5);assert.equal(grouped.reports.find((r:any)=>r.id===distinct.report_id).evidence.length,1);
  assert.equal((await db.query<{event_id:string}>('select event_id from follows where user_id=$1',[ids[1]])).rows[0].event_id,first.event_id);
  const source=(await db.query<{state:string;merged_into:string}>('select state,merged_into from events where id=$1',[distinct.event_id])).rows[0];assert.equal(source.state,'removed');assert.equal(source.merged_into,first.event_id);
  await assert.rejects(()=>mutate(ids[2],'merge',{...merge,source_event_id:old.event_id}),/reported in both/);
  assert.equal((await db.query('select * from reports where event_id=$1',[old.event_id])).rows.length,1);
  assert.equal((await db.query<{v:boolean}>("select has_function_privilege('authenticated','public.mutate_before_local_news(uuid,text,jsonb)','EXECUTE') v")).rows[0].v,false);
 }finally{await db.close();}
});
