'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type ActionResult={ok:boolean;message:string;eventId?:string;reportId?:string};
const categories=['Road & transit','Weather & hazards','Traffic','Community event','Public service','Other'];
function text(form:FormData,key:string,max:number){return String(form.get(key)||'').trim().slice(0,max);}
function isoDate(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?null:d.toISOString();}
async function origin(){return process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000';}
async function signedClient(){const client=await createSupabaseServerClient();if(!client)throw new Error('Configure Supabase before using this feature.');const {data:{user}}=await client.auth.getUser();if(!user)throw new Error('Sign in to continue.');return {client,user};}
async function verifiedClient(){const result=await signedClient();if(!result.user.email_confirmed_at)throw new Error('Verify your email before submitting reports.');return result;}

export async function signUpAction(_prev:ActionResult,form:FormData):Promise<ActionResult>{
  const client=await createSupabaseServerClient();if(!client)return {ok:false,message:'Authentication is not configured. See the setup guide.'};
  const email=text(form,'email',254).toLowerCase(),password=String(form.get('password')||''),display_name=text(form,'display_name',40);
  if(!email||password.length<12||display_name.length<2)return {ok:false,message:'Enter a valid email, a 12-character password, and a display name.'};
  const {error}=await client.auth.signUp({email,password,options:{data:{display_name},emailRedirectTo:`${await origin()}/auth/callback?next=/`}});
  return error?{ok:false,message:error.message}:{ok:true,message:'Check your email to verify the account. Verification confirms inbox access, not identity or report accuracy.'};
}

export async function signInAction(_prev:ActionResult,form:FormData):Promise<ActionResult>{
  const client=await createSupabaseServerClient();if(!client)return {ok:false,message:'Authentication is not configured. See the setup guide.'};
  const {data,error}=await client.auth.signInWithPassword({email:text(form,'email',254).toLowerCase(),password:String(form.get('password')||'')});
  if(error||!data.user)return {ok:false,message:'Email or password did not match.'};
  return {ok:true,message:data.user.email_confirmed_at?'Signed in.':'Signed in, but verify your email before contributing.'};
}

export async function resendVerificationAction(_prev:ActionResult,form:FormData):Promise<ActionResult>{
  const client=await createSupabaseServerClient();if(!client)return {ok:false,message:'Authentication is not configured.'};
  const email=text(form,'email',254).toLowerCase();if(!email)return {ok:false,message:'Enter the account email address.'};
  const {error}=await client.auth.resend({type:'signup',email,options:{emailRedirectTo:`${await origin()}/auth/callback?next=/`}});
  return error?{ok:false,message:'Could not resend verification. Check the email service configuration.'}:{ok:true,message:'If the address belongs to an unverified account, a verification email has been sent.'};
}

export async function signOutAction(){const client=await createSupabaseServerClient();await client?.auth.signOut();revalidatePath('/');}

export async function resetPasswordAction(_prev:ActionResult,form:FormData):Promise<ActionResult>{
  const client=await createSupabaseServerClient();if(!client)return {ok:false,message:'Authentication is not configured.'};
  const {error}=await client.auth.resetPasswordForEmail(text(form,'email',254).toLowerCase(),{redirectTo:`${await origin()}/auth/callback?next=/auth/reset`});
  return error?{ok:false,message:'Unable to start password recovery. Check configuration and try again.'}:{ok:true,message:'If the address belongs to an account, a recovery link has been sent.'};
}

export async function updatePasswordAction(_prev:ActionResult,form:FormData):Promise<ActionResult>{
  const client=await createSupabaseServerClient();if(!client)return {ok:false,message:'Authentication is not configured.'};
  const password=String(form.get('password')||'');if(password.length<12)return {ok:false,message:'Use at least 12 characters.'};
  const {data:{user}}=await client.auth.getUser();if(!user)return {ok:false,message:'Open the password reset link from your email first.'};
  const {error}=await client.auth.updateUser({password});return error?{ok:false,message:error.message}:{ok:true,message:'Password updated.'};
}

export async function createEventAction(form:FormData):Promise<ActionResult>{
  try{
    const {client,user}=await verifiedClient();const category=text(form,'category',40),title=text(form,'title',120),location=text(form,'location_label',120),observation=text(form,'observation',2000),observed_at=isoDate(text(form,'observed_at',50));
    if(!categories.includes(category)||title.length<5||location.length<2||observation.length<10||!observed_at)return {ok:false,message:'Complete the short event form with valid details.'};
    const {data,error}=await client.rpc('create_event_report',{p_category:category,p_title:title,p_location_label:location,p_observed_at:observed_at,p_observation:observation,p_approximate_lat:null,p_approximate_lng:null});
    if(error)return {ok:false,message:error.message==='report_limit_reached'?'You have reached the daily report limit. Please try again later.':'Could not submit the report. Please retry.'};
    const {data:report}=await client.from('witness_reports').select('id').eq('event_id',data).eq('user_id',user.id).single();
    revalidatePath('/');return {ok:true,message:'Report submitted. It has one witness account so far.',eventId:data as string,reportId:report?.id};
  }catch(e){return {ok:false,message:e instanceof Error?e.message:'Could not submit the report.'};}
}

export async function addWitnessAction(eventId:string,form:FormData):Promise<ActionResult>{
  try{const {client}=await verifiedClient();const observation=text(form,'observation',2000),observed_at=isoDate(text(form,'observed_at',50));if(observation.length<10||!observed_at)return {ok:false,message:'Add what you personally observed and when.'};const {data,error}=await client.rpc('add_witness_report',{p_event_id:eventId,p_observation:observation,p_observed_at:observed_at});if(error)return {ok:false,message:error.code==='23505'?'Your account already has an observation on this event.':'Could not add the observation.'};revalidatePath('/');return {ok:true,message:'Observation added. Source independence still needs review.',reportId:data as string};}catch(e){return {ok:false,message:e instanceof Error?e.message:'Could not add the observation.'};}
}

export async function correctReportAction(reportId:string,form:FormData):Promise<ActionResult>{
  try{const {client,user}=await verifiedClient();const revision_text=text(form,'revision_text',2000),reason=text(form,'reason',500);if(revision_text.length<10||reason.length<3)return {ok:false,message:'Add the corrected observation and explain the change.'};const {error}=await client.from('report_revisions').insert({report_id:reportId,user_id:user.id,revision_text,reason});if(error)return {ok:false,message:'Could not save the correction.'};revalidatePath('/');return {ok:true,message:'Correction added to the visible report history.'};}catch(e){return {ok:false,message:e instanceof Error?e.message:'Could not correct the report.'};}
}

export async function flagEventAction(eventId:string,form:FormData):Promise<ActionResult>{
  try{const {client,user}=await verifiedClient();const reason=text(form,'reason',500);if(reason.length<5)return {ok:false,message:'Briefly explain why this needs review.'};const {error}=await client.from('event_flags').insert({event_id:eventId,reporter_id:user.id,reason});return error?{ok:false,message:'Could not submit the review flag.'}:{ok:true,message:'Flag sent to moderators.'};}catch(e){return {ok:false,message:e instanceof Error?e.message:'Could not submit the flag.'};}
}

export async function appealEventAction(eventId:string,form:FormData):Promise<ActionResult>{
  try{const {client,user}=await verifiedClient();const reason=text(form,'reason',1500);if(reason.length<10)return {ok:false,message:'Please explain the appeal.'};const {error}=await client.from('event_appeals').insert({event_id:eventId,appellant_id:user.id,reason});return error?{ok:false,message:'Could not submit the appeal.'}:{ok:true,message:'Appeal sent for moderator review.'};}catch(e){return {ok:false,message:e instanceof Error?e.message:'Could not submit the appeal.'};}
}

export async function followEventAction(eventId:string,follow:boolean):Promise<ActionResult>{
  try{const {client,user}=await verifiedClient();const result=follow?await client.from('event_follows').upsert({event_id:eventId,user_id:user.id}):await client.from('event_follows').delete().eq('event_id',eventId).eq('user_id',user.id);return result.error?{ok:false,message:'Could not update event follows.'}:{ok:true,message:follow?'Following event updates.':'Stopped following event.'};}catch(e){return {ok:false,message:e instanceof Error?e.message:'Could not update event follows.'};}
}

export async function deletionRequestAction():Promise<ActionResult>{
  try{const {client,user}=await signedClient();const {error}=await client.from('account_deletion_requests').upsert({user_id:user.id,status:'pending'});return error?{ok:false,message:'Could not request account deletion.'}:{ok:true,message:'Deletion request recorded. Your account remains active until the request is processed.'};}catch(e){return {ok:false,message:e instanceof Error?e.message:'Could not request deletion.'};}
}

export async function updateDisplayNameAction(_prev:ActionResult,form:FormData):Promise<ActionResult>{
  try{const {client,user}=await signedClient();const display_name=text(form,'display_name',40);if(display_name.length<2)return {ok:false,message:'Choose a display name with at least two characters.'};const {error}=await client.from('profiles').update({display_name}).eq('id',user.id);return error?{ok:false,message:'Could not update the display name.'}:{ok:true,message:'Display name updated.'};}catch(e){return {ok:false,message:e instanceof Error?e.message:'Could not update the display name.'};}
}

export async function moderatorAction(eventId:string,flagId:string|null,action:string,reason:string):Promise<ActionResult>{
  try{const {client}=await signedClient();const {error}=await client.rpc('apply_moderation_action',{p_event_id:eventId||null,p_flag_id:flagId,p_action:action,p_reason:reason});if(error)return {ok:false,message:'Moderator authorization or action failed.'};revalidatePath('/');return {ok:true,message:'Moderation action recorded.'};}catch(e){return {ok:false,message:e instanceof Error?e.message:'Moderator action failed.'};}
}
