import { NextRequest,NextResponse } from 'next/server';
import { admin,identity } from '@/lib/server';
import { configured,demo } from '@/lib/supabase';
import { z } from 'zod';
export const dynamic='force-dynamic';
const uuid=z.uuid();const report=z.object({body:z.string().min(20).max(4000),observed_at:z.iso.datetime({offset:true}),assisted:z.boolean()});
const operations={create:report.extend({title:z.string().min(8).max(140),category:z.enum(['Environment','Roads & transit','Public services','Community','Other']),location:z.string().min(3).max(120)}),report:report.extend({event_id:uuid}),correct:report.extend({report_id:uuid,reason:z.string().min(10).max(2000)}),follow:z.object({event_id:uuid,following:z.boolean()}),flag:z.object({event_id:uuid,report_id:uuid.optional(),reason:z.string().min(10).max(2000)}),appeal:z.object({event_id:uuid,report_id:uuid.optional(),reason:z.string().min(10).max(2000)}),moderate:z.object({event_id:uuid,report_id:uuid.optional(),concern_id:uuid.optional(),public_notice:z.string().min(10).max(2000),state:z.enum(['visible','quarantined','removed','open','under_review','corroborated','conflicting']),reason:z.string().min(10).max(2000)}),deletion:z.object({})};
export async function GET(req:NextRequest){
 if(demo||!configured)return NextResponse.json({error:'Live service is not configured.'},{status:503});
 try{
  const db=admin();const mode=req.nextUrl.searchParams.get('mode');
  if(mode==='account'){
   const {user}=await identity();const {data:profile,error:pError}=await db.from('profiles').select('display_name,role').eq('id',user.id).single();if(pError)throw pError;
   const results=await Promise.all([db.from('follows').select('event_id,created_at').eq('user_id',user.id),db.from('concerns').select('id,event_id,report_id,reason,kind,resolved,created_at').eq('user_id',user.id),db.from('deletion_requests').select('state,requested_at').eq('user_id',user.id),db.from('reports').select('id,event_id,body,observed_at,assisted,state,created_at,evidence(id,mime,sha256,received_at,preview_path)').eq('author_id',user.id)]);
   for(const result of results)if(result.error)throw result.error;
   const [follows,concerns,deletion,reports]=results.map(r=>r.data??[]);
   const ownReports=z.array(z.object({id:uuid,event_id:uuid})).parse(reports); const ownIds=new Set(ownReports.map(r=>r.id)); let decisions:unknown[]=[]; if(ownReports.length){const {data:rows,error:dError}=await db.from('audit').select('id,event_id,created_at,details').eq('action','moderation').in('event_id',[...new Set(ownReports.map(r=>r.event_id))]).order('created_at',{ascending:false}).limit(100);if(dError)throw dError; decisions=(rows??[]).filter(r=>r.details?.public_notice&&(!r.details.report_id||ownIds.has(r.details.report_id))).map(r=>({id:r.id,event_id:r.event_id,created_at:r.created_at,notice:r.details.public_notice}));} return NextResponse.json({id:user.id,profile,follows,concerns,deletion,reports,decisions},{headers:{'Cache-Control':'no-store'}});
  }
  if(mode==='moderation'){
   const {user}=await identity();const {data:profile}=await db.from('profiles').select('role').eq('id',user.id).single();if(!['moderator','admin'].includes(profile?.role))return NextResponse.json({error:'Moderator access required.'},{status:403});
   const [concerns,events,reports,audit]=await Promise.all([db.from('concerns').select('*').order('created_at',{ascending:false}).limit(100),db.from('events').select('*').order('created_at',{ascending:false}).limit(100),db.from('reports').select('*,evidence(id,mime,sha256,received_at)').order('created_at',{ascending:false}).limit(200),db.from('audit').select('*').order('created_at',{ascending:false}).limit(100)]);
   return NextResponse.json({concerns:concerns.data,events:events.data,reports:reports.data,audit:audit.data},{headers:{'Cache-Control':'no-store'}});
  }
  const {data,error}=await db.rpc('public_feed');if(error)throw error;return NextResponse.json({events:data},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('Fieldnote read failed',e);return NextResponse.json({error:'Unable to load data. Check your connection or sign in again.'},{status:503});}
}
export async function POST(req:NextRequest){
 if(demo||!configured)return NextResponse.json({error:'Submissions are unavailable in demo or unconfigured mode.'},{status:503});
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Request origin rejected.'},{status:403});
 if(Number(req.headers.get('content-length'))>16000)return NextResponse.json({error:'Request too large.'},{status:413});
 try{const {user}=await identity();const input=await req.json();const operation=input.operation as keyof typeof operations;if(!operations[operation])throw new Error('Unknown action.');const payload=operations[operation].parse(input.payload);const {data,error}=await admin().rpc('mutate',{actor:user.id,operation,payload});if(error){console.error('Mutation rejected',error.code);const message=error.code==='23505'?'You already submitted an account for this event. Use correction instead.':error.message;return NextResponse.json({error:message},{status:400});}return NextResponse.json(data);
 }catch(e){return NextResponse.json({error:e instanceof z.ZodError?'Please check the form fields.':e instanceof Error?e.message:'Action failed.'},{status:400});}
}
