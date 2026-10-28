import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export type Witness = { id: string; user_id: string | null; observation: string; observed_at: string; created_at: string; display_name: string; verification: string; revisions?:{revision_text:string;reason:string;created_at:string}[]; evidence?: Evidence };
export type Evidence = { id: string; mime_type: string; sha256?: string; integrity_status: string; server_received_at: string; preview_url?: string | null; reviewer_only?: boolean; can_view_original?: boolean };
export type AssessmentFactors={distinct_accounts_points:number;capture_provenance_points:number;recency_points:number;moderator_review_points:number;conflict_penalty:number;distinct_account_count:number;eligible_capture_count:number;note:string};
export type FieldnoteEvent = { id: string; category: string; title: string; location_label: string; observed_at: string; status: string; created_at: string; reports: Witness[]; assessment_score:number|null;assessment_factors?:AssessmentFactors;sample?: boolean };

const demoEvents: FieldnoteEvent[] = [
  { id:'demo-1',category:'Road & transit',title:'Lane closure reported near E 10th Street',location_label:'E 10th St · approximate area',observed_at:'2026-10-28T15:42:00Z',status:'independence_under_review',created_at:'2026-10-28T15:42:00Z',assessment_score:2,assessment_factors:{distinct_accounts_points:1,capture_provenance_points:0,recency_points:1,moderator_review_points:0,conflict_penalty:0,distinct_account_count:2,eligible_capture_count:0,note:'Illustrative only. Distinct accounts do not prove independent sources.'},sample:true,reports:[{id:'demo-r1',user_id:null,observation:'Eastbound traffic is down to one lane near the intersection. Traffic is moving slowly.',observed_at:'2026-10-28T15:42:00Z',created_at:'2026-10-28T15:42:00Z',display_name:'M. Rivera',verification:'Email verified'},{id:'demo-r2',user_id:null,observation:'I saw cones and a utility truck in the same area. I can confirm one eastbound lane is closed.',observed_at:'2026-10-28T15:49:00Z',created_at:'2026-10-28T15:49:00Z',display_name:'PrairieWalk',verification:'Email verified'}]},
  { id:'demo-2',category:'Weather & hazards',title:'Standing water reported near Sertoma Park trail',location_label:'Sertoma Park · approximate area',observed_at:'2026-10-28T14:18:00Z',status:'single_report',created_at:'2026-10-28T14:18:00Z',assessment_score:1,assessment_factors:{distinct_accounts_points:0,capture_provenance_points:0,recency_points:1,moderator_review_points:0,conflict_penalty:0,distinct_account_count:1,eligible_capture_count:0,note:'Illustrative only. Distinct accounts do not prove independent sources.'},sample:true,reports:[{id:'demo-r3',user_id:null,observation:'Water is covering part of the path near the park entrance. I turned around rather than ride through it.',observed_at:'2026-10-28T14:18:00Z',created_at:'2026-10-28T14:18:00Z',display_name:'willow.line',verification:'Email verified'}]},
  { id:'demo-3',category:'Traffic',title:'Slow traffic around 41st St and Louise Ave',location_label:'41st St & Louise Ave · approximate area',observed_at:'2026-10-28T13:56:00Z',status:'single_report',created_at:'2026-10-28T13:56:00Z',assessment_score:1,assessment_factors:{distinct_accounts_points:0,capture_provenance_points:0,recency_points:1,moderator_review_points:0,conflict_penalty:0,distinct_account_count:1,eligible_capture_count:0,note:'Illustrative only. Distinct accounts do not prove independent sources.'},sample:true,reports:[{id:'demo-r4',user_id:null,observation:'Traffic was backed up through the intersection heading north. I did not see a crash.',observed_at:'2026-10-28T13:56:00Z',created_at:'2026-10-28T13:56:00Z',display_name:'northstar',verification:'Email verified'}]},
];

export async function getFieldnoteData() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    const demo = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
    return { configured: false, demo, events: demo ? demoEvents : [], user: null, displayName: null, moderator: false };
  }
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: events, error }, profileResult, roleResult] = await Promise.all([
    supabase.from('events').select('id,category,title,location_label,observed_at,status,created_at,assessment_score,assessment_factors').eq('visibility','public').order('created_at',{ascending:false}).limit(50),
    user ? supabase.from('profiles').select('display_name').eq('id',user.id).maybeSingle() : Promise.resolve({data:null,error:null}),
    user ? supabase.from('moderator_roles').select('user_id').eq('user_id',user.id).maybeSingle() : Promise.resolve({data:null,error:null}),
  ]);
  if (error) return { configured: true, demo: false, events: [], user: user ? {id:user.id,email:user.email||'',verified:Boolean(user.email_confirmed_at)} : null, displayName:profileResult.data?.display_name||null, moderator:Boolean(roleResult.data), error:'Reports could not be loaded. Please refresh.' };
  const ids=(events||[]).map(e=>e.id);
  const {data:reports}=ids.length?await supabase.from('witness_reports').select('id,event_id,user_id,observation,observed_at,created_at').in('event_id',ids).order('created_at',{ascending:true}):{data:[]};
  const reportRows=reports||[];
  const reportIds=reportRows.map(r=>r.id);
  const {data:revisionRows}=reportIds.length?await supabase.from('report_revisions').select('id,report_id,revision_text,reason,created_at').in('report_id',reportIds).order('created_at',{ascending:true}):{data:[]};
  const revisionsByReport=new Map<string,{revision_text:string;reason:string;created_at:string}[]>();
  for(const revision of revisionRows||[]){const list=revisionsByReport.get(revision.report_id)||[];list.push({revision_text:revision.revision_text,reason:revision.reason,created_at:revision.created_at});revisionsByReport.set(revision.report_id,list);}
  const profileIds=[...new Set(reportRows.map(r=>r.user_id).filter(Boolean))] as string[];
  const {data:profiles}=profileIds.length?await supabase.from('profiles').select('id,display_name').in('id',profileIds):{data:[]};
  const names=new Map((profiles||[]).map(p=>[p.id,p.display_name]));
  const admin=createSupabaseAdminClient();
  const {data:evidenceRows}=reportIds.length&&admin?await admin.from('evidence').select('id,report_id,uploader_id,mime_type,sha256,integrity_status,server_received_at,preview_path').in('report_id',reportIds):{data:[]};
  const evidenceMap=new Map<string,Evidence>();
  for(const item of evidenceRows||[]){let preview_url:string|null=null;if(item.preview_path&&admin){const {data}=await admin.storage.from('evidence-previews').createSignedUrl(item.preview_path,180);preview_url=data?.signedUrl||null;}const authorized=user?.id===item.uploader_id||Boolean(roleResult.data);evidenceMap.set(item.report_id,{id:item.id,mime_type:item.mime_type,...(authorized?{sha256:item.sha256}:{}),integrity_status:item.integrity_status,server_received_at:item.server_received_at,preview_url,reviewer_only:!item.preview_path,can_view_original:authorized});}
  const mapped=(events||[]).map(e=>({ ...e, reports:reportRows.filter(r=>r.event_id===e.id).map(r=>({id:r.id,user_id:r.user_id,observation:r.observation,observed_at:r.observed_at,created_at:r.created_at,display_name:r.user_id?names.get(r.user_id)||'Witness':'Former witness',verification:'Email verified',revisions:revisionsByReport.get(r.id)||[],evidence:evidenceMap.get(r.id)})) } as FieldnoteEvent));
  return {configured:true,demo:false,events:mapped,user:user?{id:user.id,email:user.email||'',verified:Boolean(user.email_confirmed_at)}:null,displayName:profileResult.data?.display_name||null,moderator:Boolean(roleResult.data)};
}

export { demoEvents };
