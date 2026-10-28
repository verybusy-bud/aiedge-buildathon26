import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(){
  const supabase=await createSupabaseServerClient();if(!supabase)return Response.json({error:'Service not configured.'},{status:503});
  const {data:{user}}=await supabase.auth.getUser();if(!user)return Response.json({error:'Sign in required.'},{status:401});
  const {data:role}=await supabase.from('moderator_roles').select('user_id').eq('user_id',user.id).maybeSingle();if(!role)return Response.json({error:'Moderator access required.'},{status:403});
  const {data,error}=await supabase.from('event_flags').select('id,event_id,reason,status,created_at,events(title,location_label,status)').eq('status','open').order('created_at',{ascending:true}).limit(100);
  if(error)return Response.json({error:'Review queue could not be loaded.'},{status:502});
  return Response.json({flags:data||[]},{headers:{'Cache-Control':'no-store, private'}});
}
