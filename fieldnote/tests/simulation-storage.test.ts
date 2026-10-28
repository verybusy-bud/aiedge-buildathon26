import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {selectSimulationUser,simulatedClient,request,simulationMedia,createSimulationUser} from '../lib/simulation';

class MemoryStorage{values=new Map<string,string>();getItem(key:string){return this.values.get(key)??null;}setItem(key:string,value:string){this.values.set(key,String(value));}removeItem(key:string){this.values.delete(key);}}
test('Browser profiles store reports and media locally with account-level authorization and cleanup',async()=>{
 const globals:Record<string,unknown>={window:new EventTarget(),location:new URL('http://simulation.test'),localStorage:new MemoryStorage(),sessionStorage:new MemoryStorage(),indexedDB:new IDBFactory()};
 for(const [name,value] of Object.entries(globals))Object.defineProperty(globalThis,name,{value,configurable:true});
 const post=async(url:string,payload:unknown)=>request(url,{method:'POST',body:JSON.stringify(payload)});
 const created=await createSimulationUser('Test author');assert.equal(created.confirmed,true);
 selectSimulationUser(created.id);
 assert.equal((await simulatedClient().auth.getUser()).data.user?.id,created.id);
 const result=await post('/api/fieldnote',{operation:'create',payload:{title:'Test traffic observation near downtown',category:'Roads & transit',location:'Downtown test location',body:'This is a test observation for local browser media storage.',observed_at:new Date().toISOString()}});assert.equal(result.status,200);const report=await result.json();
 const intent=await(await post('/api/media',{action:'intent',report_id:report.report_id})).json();
 const bytes=new Uint8Array([0x1a,0x45,0xdf,0xa3,...new TextEncoder().encode('webm-test-only')]);const file=new Blob([bytes],{type:'video/webm'});
 assert.equal((await simulatedClient().storage.from().uploadToSignedUrl(intent.path,intent.token,file)).error,null);
 const finalized=await post('/api/media',{action:'finalize',intent_id:intent.id,public_preview:false});assert.equal(finalized.status,200);const evidence=await finalized.json();assert.equal(evidence.sha256.length,64);
 assert.equal((await post('/api/media',{action:'finalize',intent_id:intent.id})).status,400);
 assert.equal((await simulationMedia(evidence.id,true)).size,file.size);
 const other=await createSimulationUser('Another reader');selectSimulationUser(other.id);await assert.rejects(()=>simulationMedia(evidence.id,true),/unavailable/);
 selectSimulationUser(created.id);
 const expired=await(await post('/api/media',{action:'intent',report_id:report.report_id})).json();const state=JSON.parse(localStorage.getItem('fieldnote-community-v2')!);state.intents.find((i:any)=>i.id===expired.id).expires_at='2000-01-01T00:00:00Z';localStorage.setItem('fieldnote-community-v2',JSON.stringify(state));
 assert.ok((await simulatedClient().storage.from().uploadToSignedUrl(expired.id,'simulation-only',file)).error);
 assert.equal((await post('/api/media',{action:'finalize',intent_id:expired.id})).status,400);
 const deleted=await post('/api/fieldnote',{operation:'deletion',payload:{}});assert.equal(deleted.status,200);
 assert.equal((await simulatedClient().auth.getUser()).data.user,null);await assert.rejects(()=>simulationMedia(evidence.id,true),/unavailable/);
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('fieldnote-simulation-media',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const missing=await new Promise(resolve=>{const r=db.transaction('files').objectStore('files').get('original:'+evidence.id);r.onsuccess=()=>resolve(r.result);});db.close();assert.equal(missing,undefined);
});
