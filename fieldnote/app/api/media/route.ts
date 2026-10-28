import { NextRequest,NextResponse } from 'next/server';
import { admin,identity } from '@/lib/server';
import { configured,demo } from '@/lib/supabase';
import { sniff } from '@/lib/media';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
export const runtime='nodejs';export const maxDuration=60;export const dynamic='force-dynamic';
const idSchema=z.uuid();
export async function POST(req:NextRequest){
 if(demo||!configured)return NextResponse.json({error:'Evidence submissions are not configured.'},{status:503});
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Request origin rejected.'},{status:403});
 try{
 const {user}=await identity();const db=admin();const input=await req.json();
 if(input.action==='intent'){
  const rid=idSchema.parse(input.report_id);const {data,error}=await db.rpc('prepare_upload',{actor:user.id,rid});if(error)throw error;
  const {data:upload,error:signError}=await db.storage.from('evidence-originals').createSignedUploadUrl(data.path,{upsert:false});if(signError)throw signError;
  return NextResponse.json({id:data.id,path:data.path,token:upload.token,expires_at:data.expires_at});
 }
 if(input.action!=='finalize')throw new Error('Unknown media action.');
 const iid=idSchema.parse(input.intent_id);const {data:intent,error}=await db.from('upload_intents').select('*').eq('id',iid).eq('user_id',user.id).single();if(error||!intent||intent.state!=='pending'||Date.parse(intent.expires_at)<Date.now())throw new Error('Upload expired or unavailable.');
 const {data:file,error:downloadError}=await db.storage.from('evidence-originals').download(intent.object_path);if(downloadError)throw downloadError;
 if(!file.size||file.size>25*1024*1024)throw new Error('Evidence must be between 1 byte and 25 MB.');
 const buffer=Buffer.from(await file.arrayBuffer());const mime=sniff(buffer);if(!mime||file.type!==mime)throw new Error('Stored content does not match a supported media type.');
 const sha256=createHash('sha256').update(buffer).digest('hex');let preview:string|null=null;
 if(input.public_preview===true&&mime.startsWith('image/')){
  const clean=await sharp(buffer,{limitInputPixels:40000000}).rotate().resize({width:1400,height:1400,fit:'inside',withoutEnlargement:true}).webp({quality:78}).toBuffer();
  preview=`${user.id}/${iid}.webp`;const {error:pError}=await db.storage.from('evidence-previews').upload(preview,clean,{contentType:'image/webp',upsert:false});if(pError)throw pError;
 }
 const {data:evidenceId,error:finishError}=await db.rpc('finish_upload',{actor:user.id,iid,hash:sha256,media_type:mime,size_bytes:file.size,preview});
 if(finishError){/* Leave any generated preview for the expired-intent cleanup; a concurrent winner may reference it. */throw finishError;}
 return NextResponse.json({id:evidenceId,sha256,mime});
 }catch(e){console.error('Evidence submission rejected',e);return NextResponse.json({error:e instanceof Error?e.message:'Evidence could not be processed.'},{status:400});}
}
export async function GET(req:NextRequest){
 if(demo||!configured)return NextResponse.json({error:'Media is unavailable.'},{status:503});
 try{
 const id=idSchema.parse(req.nextUrl.searchParams.get('id'));const original=req.nextUrl.searchParams.get('original')==='true';const db=admin();
 const {data:v,error}=await db.from('evidence').select('*,reports!inner(author_id,state,events!inner(state))').eq('id',id).single();if(error||!v)return new NextResponse(null,{status:404});
 let path=v.preview_path;let bucket='evidence-previews';
 if(original){const {user}=await identity();const {data:profile}=await db.from('profiles').select('role').eq('id',user.id).single();if(v.reports.author_id!==user.id&&!['moderator','admin'].includes(profile?.role))return new NextResponse(null,{status:403});path=v.original_path;bucket='evidence-originals';}
 else if(v.reports.state!=='visible'||v.reports.events.state!=='visible'||!path)return new NextResponse(null,{status:404});
 const {data,error:sError}=await db.storage.from(bucket).createSignedUrl(path,60,{download:original});if(sError)throw sError;
 return NextResponse.redirect(data.signedUrl,{status:307,headers:{'Cache-Control':'private, no-store'}});
 }catch{return new NextResponse(null,{status:403});}
}
