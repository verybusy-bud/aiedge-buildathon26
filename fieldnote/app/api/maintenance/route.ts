import { NextRequest,NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { admin } from '@/lib/server';
export const runtime='nodejs';export const maxDuration=60;
export async function POST(req:NextRequest){
 const expected=process.env.CRON_SECRET;const provided=req.headers.get('authorization')??'';
 if(!expected||provided.length!==`Bearer ${expected}`.length||!timingSafeEqual(Buffer.from(provided),Buffer.from(`Bearer ${expected}`)))return new NextResponse(null,{status:403});
 try{const db=admin();const {error}=await db.rpc('record_assessments');if(error)throw error;
 const {data:intents,error:iError}=await db.from('upload_intents').select('*').eq('state','pending').lt('expires_at',new Date(Date.now()-5*60000).toISOString()).limit(50);if(iError)throw iError;
 for(const i of intents??[]){const a=await db.storage.from('evidence-originals').remove([i.object_path]);const b=await db.storage.from('evidence-previews').remove([`${i.user_id}/${i.id}.webp`]);if(a.error||b.error)throw a.error??b.error;const {error:uError}=await db.from('upload_intents').update({state:'cleaned'}).eq('id',i.id).eq('state','pending');if(uError)throw uError;}
 return NextResponse.json({ok:true,expired_uploads_cleaned:intents?.length??0});
 }catch(e){console.error('Maintenance failed',e);return NextResponse.json({error:'Maintenance failed. Check server logs.'},{status:500});}
}
