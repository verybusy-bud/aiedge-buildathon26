'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, Download, Users } from 'lucide-react';
import { simulationUsers, selectSimulationUser, createSimulationUser, simulationMedia } from '@/lib/simulation';
import type { Evidence } from '@/lib/types';

export function SimulationAuth({done}:{done:(message:string)=>void}){
 const [users,setUsers]=useState<ReturnType<typeof simulationUsers>>([]),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{try{setUsers(simulationUsers());}catch(e){setError((e as Error).message);}},[]);
 return <div className="simulation-auth"><p>Create a profile or choose one saved in this browser.</p>{users.length>0&&<div className="test-accounts">{users.map(user=><button key={user.id} className="test-account" onClick={()=>{try{selectSimulationUser(user.id);done(`Welcome back, ${user.display_name}.`);}catch(e){setError((e as Error).message);}}}><Users size={17}/><span><strong>{user.display_name}</strong><small>Use this profile</small></span><ArrowRight size={16}/></button>)}</div>}
 <form className="form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const user=await createSimulationUser(name);setUsers(simulationUsers());done(`Welcome, ${user.display_name}. You can now share an observation.`);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><label>Your name<input minLength={2} maxLength={40} required value={name} onChange={e=>setName(e.target.value)} placeholder="Name" autoComplete="off"/></label><button className="primary" disabled={busy}>Create profile</button></form>
 {error&&<p className="form-error" role="alert">{error}</p>}<small className="simulation-footnote">Profiles and posts stay in this browser. They are not shared with other visitors or devices.</small></div>;
}

export function SimulationEvidence({evidence,original=false}:{evidence:Evidence;original?:boolean}){
 const [url,setUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>{if(original||!evidence.preview_path)return;let active=true,objectUrl='';simulationMedia(evidence.id).then(blob=>{if(active){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}}).catch(()=>{if(active)setError('Preview unavailable.');});return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[evidence.id,evidence.preview_path,original]);
 if(original)return <><button type="button" className="text-button" onClick={async()=>{try{const blob=await simulationMedia(evidence.id,true),objectUrl=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=`fieldnote-${evidence.id}.${evidence.mime.split('/')[1]}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),10000);}catch(e){setError((e as Error).message);}}}><Download size={13}/>Download original</button>{error&&<small role="status">{error}</small>}</>;
 return <>{url&&<img src={url} alt="Consented image preview" loading="lazy"/>}{error&&<small role="status">{error}</small>}</>;
}
