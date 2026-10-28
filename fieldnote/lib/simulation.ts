'use client';
import { simulation } from './mode';
import { freshSimulation, applySimulation, publicSimulation, requireSimUser, simulationAccount, simulationQueue, recalculate, type SimState } from './simulation-core';
import { sniff } from './media';
import { createStarterEvents } from './starter-events';
const STATE='fieldnote-community-v2',SESSION='fieldnote-profile-v2';
export const simulationChanged='fieldnote:simulation-changed';
function emit(){window.dispatchEvent(new Event(simulationChanged));}
function ensureStarterEvents(state:SimState){const known=new Set(state.events.map(event=>event.id));const missing=createStarterEvents().filter(event=>!known.has(event.id));if(!missing.length)return false;state.events.push(...missing.map(event=>({...event,state:'visible'})));return true;}
const retiredProfileNames = new Set(['cyber-striker','linkis','prairie walker','park walker','river observer','southside neighbor','review moderator']);
function removeRetiredProfiles(state:SimState){
 const retired=new Set(state.users.filter(user=>retiredProfileNames.has(user.display_name.trim().toLocaleLowerCase())||user.id.startsWith('demo-')||user.email.endsWith('@example.test')).map(user=>user.id));
 if(!retired.size)return false;
 state.users=state.users.filter(user=>!retired.has(user.id));
 const affectedEvents=new Set(state.events.filter(event=>event.reports.some(report=>retired.has(report.author_id))).map(event=>event.id));
 for(const event of state.events)event.reports=event.reports.filter(report=>!retired.has(report.author_id));
 state.events=state.events.filter(event=>!affectedEvents.has(event.id)||event.reports.length>0);
 state.follows=state.follows.filter(follow=>!retired.has(follow.user_id)&&state.events.some(event=>event.id===follow.event_id));
 state.concerns=state.concerns.filter(concern=>!retired.has(concern.user_id)&&state.events.some(event=>event.id===concern.event_id));
 state.audit=state.audit.filter(entry=>!retired.has(entry.actor_id)&&state.events.some(event=>event.id===entry.event_id));
 state.intents=state.intents.filter(intent=>!retired.has(intent.user_id));
 state.history=state.history.filter(row=>state.events.some(event=>event.id===row.event_id));
 if(retired.has(sessionStorage.getItem(SESSION)??''))sessionStorage.removeItem(SESSION);
 return true;
}
function read():SimState{const value=localStorage.getItem(STATE);if(value){const parsed=JSON.parse(value) as SimState;if(parsed.version!==1)throw new Error('Unsupported simulation data.');const changed=ensureStarterEvents(parsed);if(removeRetiredProfiles(parsed)||changed)localStorage.setItem(STATE,JSON.stringify(parsed));return parsed;}const state=freshSimulation();localStorage.setItem(STATE,JSON.stringify(state));return state;}
function write(state:SimState){try{localStorage.setItem(STATE,JSON.stringify(state));}catch{throw new Error('Browser storage is full or unavailable. Remove unused test data and try again.');}emit();}
function actor(){return sessionStorage.getItem(SESSION);}
async function locked<T>(task:()=>Promise<T>):Promise<T>{return navigator.locks?navigator.locks.request(STATE,task):task();}

async function database(){return new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('fieldnote-simulation-media',1);request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Browser media storage is unavailable.'));});}
async function blobStore(action:'get'|'put'|'delete',key:string,value?:Blob):Promise<Blob|undefined>{const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('files',action==='get'?'readonly':'readwrite'),store=tx.objectStore('files');const request=action==='get'?store.get(key):action==='put'?store.put(value,key):store.delete(key);let result:Blob|undefined;request.onsuccess=()=>{result=action==='get'?request.result:undefined;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(new Error('Could not save media in this browser.'));tx.onabort=()=>reject(new Error('Browser media transaction was cancelled.'));});}finally{db.close();}}
export function simulationUsers(){return read().users;}
export function selectSimulationUser(id:string){requireSimUser(read(),id);sessionStorage.setItem(SESSION,id);emit();}
export async function createSimulationUser(name:string){return locked(async()=>{if(name.trim().length<2||name.length>40)throw new Error('Use a name between 2 and 40 characters.');const state=read();const user={id:crypto.randomUUID(),display_name:name.trim(),email:`local-${crypto.randomUUID().slice(0,8)}@fieldnote.local`,role:'member' as const,confirmed:true};state.users.push(user);write(state);selectSimulationUser(user.id);return user;});}
export async function confirmSimulationUser(id:string){await locked(async()=>{const state=read(),user=state.users.find(u=>u.id===id);if(!user)throw new Error('Profile unavailable.');user.confirmed=true;write(state);});selectSimulationUser(id);}
export function simulatedClient(){return {auth:{
 getUser:async()=>{const user=read().users.find(u=>u.id===actor()&&u.confirmed);return {data:{user:user?{id:user.id,email:user.email,email_confirmed_at:'simulated'}:null},error:null};},
 signOut:async()=>{sessionStorage.removeItem(SESSION);emit();return {error:null};},
 onAuthStateChange:(callback:()=>void)=>{const handler=()=>callback();window.addEventListener(simulationChanged,handler);window.addEventListener('storage',handler);return {data:{subscription:{unsubscribe:()=>{window.removeEventListener(simulationChanged,handler);window.removeEventListener('storage',handler);}}}};},
 },storage:{from:()=>({uploadToSignedUrl:async(path:string,_token:string,file:Blob)=>{
  try{const state=read(),user=requireSimUser(state,actor()),intent=state.intents.find(i=>i.id===path&&i.user_id===user.id&&i.state==='pending');if(!intent||Date.parse(intent.expires_at)<Date.now())throw new Error('Upload expired.');if(!file.size||file.size>25*1024*1024)throw new Error('Capture must be under 25 MB.');await blobStore('put','pending:'+intent.id,file);return {data:{path},error:null};}catch(e){return {data:null,error:e as Error};}
 }})}};}

async function imagePreview(file:Blob){const image=await createImageBitmap(file);try{if(image.width*image.height>40000000)throw new Error('Image is too large to process.');const scale=Math.min(1,1400/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const context=canvas.getContext('2d');if(!context)throw new Error('Image processing unavailable.');context.drawImage(image,0,0,canvas.width,canvas.height);return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Preview processing failed.')),'image/webp',.78));}finally{image.close();}}
async function mediaAction(state:SimState,input:any){const user=requireSimUser(state,actor());
 if(input.action==='intent'){
  const report=state.events.filter(e=>e.state==='visible').flatMap(e=>e.reports).find(r=>r.id===input.report_id&&r.author_id===user.id&&r.state==='visible');if(!report)throw new Error('Report unavailable.');if(state.intents.filter(i=>i.user_id===user.id&&Date.parse(i.created_at??i.expires_at)>Date.now()-86400000).length>=36)throw new Error('Capture limit reached.');if(state.intents.filter(i=>i.report_id===report.id).length>=4)throw new Error('Four captures per report maximum.');const intent={id:crypto.randomUUID(),user_id:user.id,report_id:report.id,expires_at:new Date(Date.now()+7200000).toISOString(),created_at:new Date().toISOString(),state:'pending' as const};state.intents.push(intent);return {id:intent.id,path:intent.id,token:'browser-only',expires_at:intent.expires_at};
 }
 if(input.action!=='finalize')throw new Error('Unknown media action.');const intent=state.intents.find(i=>i.id===input.intent_id&&i.user_id===user.id&&i.state==='pending');if(!intent||Date.parse(intent.expires_at)<Date.now())throw new Error('Upload expired or already finalized.');const report=state.events.filter(e=>e.state==='visible').flatMap(e=>e.reports).find(r=>r.id===intent.report_id&&r.author_id===user.id&&r.state==='visible');if(!report)throw new Error('Report unavailable.');const file=await blobStore('get','pending:'+intent.id);if(!file||!file.size||file.size>25*1024*1024)throw new Error('Capture unavailable or too large.');const bytes=new Uint8Array(await file.arrayBuffer()),mime=sniff(bytes);if(!mime||mime!==file.type)throw new Error('Unsupported capture format.');const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));const sha256=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');let preview:string|null=null;if(input.public_preview===true&&mime.startsWith('image/')){await blobStore('put','preview:'+intent.id,await imagePreview(file));preview=intent.id;}await blobStore('put','original:'+intent.id,file);await blobStore('delete','pending:'+intent.id);report.evidence.push({id:intent.id,mime,sha256,received_at:new Date().toISOString(),preview_path:preview});intent.state='complete';recalculate(state);return {id:intent.id,sha256,mime};
}
export async function simulationMedia(id:string,original=false){const state=read();const event=state.events.find(e=>e.reports.some(r=>r.evidence.some(v=>v.id===id))),report=event?.reports.find(r=>r.evidence.some(v=>v.id===id)),evidence=report?.evidence.find(v=>v.id===id);if(!event||!report||!evidence)throw new Error('Capture unavailable.');if(original){const user=requireSimUser(state,actor());if(user.id!==report.author_id&&user.role!=='moderator')throw new Error('Original unavailable to this test account.');}else if(event.state!=='visible'||report.state!=='visible'||!evidence.preview_path)throw new Error('Preview unavailable.');const blob=await blobStore('get',(original?'original:':'preview:')+id);if(!blob)throw new Error('Capture unavailable.');return blob;}

export async function request(url:string,options?:RequestInit):Promise<Response>{
 if(!simulation)return fetch(url,options);
 try{return await locked(async()=>{
  const state=read();
  for(const intent of state.intents.filter(i=>i.state==='pending'&&Date.parse(i.expires_at)<Date.now())){for(const prefix of ['pending:','original:','preview:'])await blobStore('delete',prefix+intent.id);state.intents=state.intents.filter(i=>i.id!==intent.id);}
  const target=new URL(url,location.origin);let data:unknown;
  if(options?.method==='POST'){
   const input=JSON.parse(String(options.body));if(target.pathname==='/api/media')data=await mediaAction(state,input);
   else{
    if(input.operation==='deletion'){const user=requireSimUser(state,actor());const ids=new Set([...state.events.flatMap(e=>e.reports.filter(r=>r.author_id===user.id).flatMap(r=>r.evidence.map(v=>v.id))),...state.intents.filter(i=>i.user_id===user.id).map(i=>i.id)]);for(const id of ids)for(const prefix of ['pending:','original:','preview:'])await blobStore('delete',prefix+id);}
    data=applySimulation(state,actor(),input.operation,input.payload);
    if(input.operation==='deletion')sessionStorage.removeItem(SESSION);
   }write(state);
  }else{const mode=target.searchParams.get('mode');data=mode==='account'?simulationAccount(state,actor()):mode==='moderation'?simulationQueue(state,actor()):{events:publicSimulation(state)};localStorage.setItem(STATE,JSON.stringify(state));}
  return Response.json(data);
 });}catch(e){return Response.json({error:e instanceof Error?e.message:'Simulation unavailable.'},{status:400});}
}
