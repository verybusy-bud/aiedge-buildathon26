import { createHash, randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime='nodejs';
const MAX_BYTES=25*1024*1024;
const supported=new Set(['image/jpeg','image/png','image/webp','video/webm','video/mp4']);

export async function POST(request:Request){
  const supabase=await createSupabaseServerClient();const admin=createSupabaseAdminClient();
  if(!supabase)return Response.json({error:'Configure authentication before uploading evidence.'},{status:503});
  if(!admin)return Response.json({error:'Private media storage is not configured.'},{status:503});
  const {data:{user}}=await supabase.auth.getUser();
  if(!user||!user.email_confirmed_at)return Response.json({error:'A verified, signed-in account is required.'},{status:401});
  let body:FormData;try{body=await request.formData();}catch{return Response.json({error:'Evidence form could not be read.'},{status:400});}
  const reportId=String(body.get('report_id')||'');const captured=String(body.get('captured_at')||'');const makePreview=body.get('public_preview')==='true';const file=body.get('media');
  if(!(file instanceof File)||!reportId)return Response.json({error:'Choose an in-app capture and submit its report first.'},{status:400});
  if(file.size<1||file.size>MAX_BYTES)return Response.json({error:'Evidence must be between 1 byte and 25 MB.'},{status:413});
  const {data:report,error:reportError}=await supabase.from('witness_reports').select('id,event_id,user_id').eq('id',reportId).single();
  if(reportError||!report||report.user_id!==user.id)return Response.json({error:'Report access was not authorized.'},{status:403});
  const bytes=Buffer.from(await file.arrayBuffer());const detected=await fileTypeFromBuffer(bytes);
  if(!detected||!supported.has(detected.mime)||detected.mime!==file.type)return Response.json({error:'Media type could not be safely verified.'},{status:415});
  const id=randomUUID();const ext=detected.ext;const originalPath=`${user.id}/${report.event_id}/${reportId}/${id}.${ext}`;const sha256=createHash('sha256').update(bytes).digest('hex');
  const {error:originalError}=await admin.storage.from('evidence-originals').upload(originalPath,bytes,{contentType:detected.mime,upsert:false});
  if(originalError)return Response.json({error:'Private evidence storage could not accept the capture.'},{status:502});
  let previewPath:string|null=null;let integrity='hash_recorded';
  if(makePreview&&detected.mime.startsWith('image/')){
    try{
      const sanitized=await sharp(bytes,{limitInputPixels:30_000_000,failOn:'error'}).rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).jpeg({quality:84,mozjpeg:true}).toBuffer();
      previewPath=`${user.id}/${report.event_id}/${reportId}/${id}.jpg`;
      const {error:previewError}=await admin.storage.from('evidence-previews').upload(previewPath,sanitized,{contentType:'image/jpeg',upsert:false});
      if(previewError)previewPath=null;else integrity='preview_sanitized';
    }catch{previewPath=null;integrity='review_required';}
  }
  const parsedCapture=captured?new Date(captured):null;const clientCapturedAt=parsedCapture&&!Number.isNaN(parsedCapture.getTime())?parsedCapture.toISOString():null;
  const {error:metadataError}=await admin.from('evidence').insert({id,report_id:reportId,uploader_id:user.id,original_path:originalPath,preview_path:previewPath,sha256,mime_type:detected.mime,byte_length:file.size,client_captured_at:clientCapturedAt,integrity_status:integrity});
  if(metadataError){await admin.storage.from('evidence-originals').remove([originalPath]);if(previewPath)await admin.storage.from('evidence-previews').remove([previewPath]);return Response.json({error:'Evidence record could not be saved.'},{status:502});}
  return Response.json({id,sha256,serverReceivedAt:new Date().toISOString(),integrityStatus:integrity,publicPreview:Boolean(previewPath),message:'The server recorded file integrity and receipt time. This does not verify the scene itself.'},{status:201});
}
