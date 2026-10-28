import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const supabase=await createSupabaseServerClient();const admin=createSupabaseAdminClient();
  if(!supabase||!admin)return Response.json({error:'Evidence service is not configured.'},{status:503});
  const {data:{user}}=await supabase.auth.getUser();if(!user)return Response.json({error:'Sign in required.'},{status:401});
  const {id}=await params;const {data:evidence}=await supabase.from('evidence').select('id,uploader_id,original_path,report_id').eq('id',id).maybeSingle();
  if(!evidence)return Response.json({error:'Evidence not found.'},{status:404});
  const {data:role}=await supabase.from('moderator_roles').select('user_id').eq('user_id',user.id).maybeSingle();
  if(evidence.uploader_id!==user.id&&!role)return Response.json({error:'Only the submitter or an authorized moderator may view the original.'},{status:403});
  const {data,error}=await admin.storage.from('evidence-originals').createSignedUrl(evidence.original_path,60);
  if(error||!data)return Response.json({error:'Evidence could not be opened.'},{status:502});
  return Response.json({url:data.signedUrl,expiresInSeconds:60},{headers:{'Cache-Control':'no-store, private'}});
}
