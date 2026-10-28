import { test } from 'node:test';import assert from 'node:assert/strict';import { PGlite } from '@electric-sql/pglite';import { readFile } from 'node:fs/promises';import { assess } from '../lib/assessment';
test('Migrations, permissions, corroboration, moderation, uploads and limits',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
 for(const name of ['001_core.sql','002_assessment.sql','003_private_uploads.sql','004_local_news_grouping.sql','005_monetization.sql']){let sql=await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');sql=sql.replace('create extension if not exists pgcrypto;','');await db.exec(sql);}
 const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
 for(const id of ids)await db.query('insert into auth.users values($1,now(),$2)',[id,JSON.stringify({display_name:'Witness'})]);
 const mutate=async(actor:string,operation:string,payload:unknown)=>{const r=await db.query<{result:any}>('select mutate($1,$2,$3) result',[actor,operation,JSON.stringify(operation==='moderate'?{...payload as object,public_notice:'Review completed; see the updated status.'}:payload)]);return r.rows[0].result;};
 const payload={title:'Water across the east trail',category:'Environment',location:'Falls Park',body:'I observed water covering part of the trail.',observed_at:new Date().toISOString(),assisted:false};
 const first=await mutate(ids[0],'create',payload);const eid=first.event_id;
 await assert.rejects(()=>mutate(ids[0],'report',{...payload,event_id:eid}),/duplicate key/);
 await mutate(ids[1],'report',{...payload,event_id:eid});
 await assert.rejects(()=>mutate(ids[0],'moderate',{event_id:eid,state:'corroborated',reason:'I am not a moderator.'}),/Moderator access/);
 await db.query("update profiles set role='moderator' where id=$1",[ids[2]]);
 await mutate(ids[2],'moderate',{event_id:eid,state:'corroborated',reason:'Separate observations reviewed.'});
 const intent=(await db.query<{v:any}>('select prepare_upload($1,$2) v',[ids[0],first.report_id])).rows[0].v;
 await assert.rejects(()=>db.query('select finish_upload($1,$2,$3,$4,$5,$6)',[ids[1],intent.id,'a'.repeat(64),'image/jpeg',100,null]),/expired|unavailable/);
 await db.query('select finish_upload($1,$2,$3,$4,$5,$6)',[ids[0],intent.id,'a'.repeat(64),'image/jpeg',100,null]);
 await assert.rejects(()=>db.query('select finish_upload($1,$2,$3,$4,$5,$6)',[ids[0],intent.id,'a'.repeat(64),'image/jpeg',100,null]),/already finalized/);
 const secondIntent=(await db.query<{v:any}>('select prepare_upload($1,$2) v',[ids[0],first.report_id])).rows[0].v;
 await db.query('select finish_upload($1,$2,$3,$4,$5,$6)',[ids[0],secondIntent.id,'a'.repeat(64),'image/jpeg',100,null]);
 const feed=(await db.query<{v:any}>('select public_feed() v')).rows[0].v;
 assert.equal(feed.length,1);assert.equal(feed[0].score,3.5);assert.equal(feed[0].factors.provenance,.5);assert.equal(feed[0].reports.length,2);
 assert.ok(!JSON.stringify(feed).includes('original_path'));assert.ok(!JSON.stringify(feed).includes('email'));
 assert.equal(feed[0].score,assess(2,1,new Date().toISOString(),true,false).score);
 await mutate(ids[2],'moderate',{event_id:eid,report_id:first.report_id,state:'quarantined',reason:'Evidence needs another review.'});
 const assessment=(await db.query<{v:any}>('select assessment($1) v',[eid])).rows[0].v;assert.equal(assessment.factors.provenance,0);assert.equal(assessment.factors.accounts,0);
 await mutate(ids[2],'moderate',{event_id:eid,report_id:first.report_id,state:'visible',reason:'Restore after completing review.'});
 await mutate(ids[2],'moderate',{event_id:eid,state:'removed',reason:'Temporarily remove this event.'});
 assert.deepEqual((await db.query<{v:any}>('select public_feed() v')).rows[0].v,[]);
 await mutate(ids[2],'moderate',{event_id:eid,state:'visible',reason:'Restore after completing review.'});
 for(let i=0;i<11;i++)await mutate(ids[0],'create',{...payload,title:`Another observed event ${i}`});
 await assert.rejects(()=>mutate(ids[0],'create',payload),/12 reports/);
 await mutate(ids[1],'deletion',{});await assert.rejects(()=>mutate(ids[1],'create',payload),/deletion is pending/);
 assert.equal((await db.query<{v:boolean}>("select has_function_privilege('authenticated','public.mutate(uuid,text,jsonb)','EXECUTE') v")).rows[0].v,false);
 assert.equal((await db.query<{v:boolean}>("select has_table_privilege('anon','public.evidence','SELECT') v")).rows[0].v,false);
 assert.ok((await db.query('select * from assessment_history')).rows.length>0);
 }finally{await db.close();}
});
