'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, Check, Download, Users } from 'lucide-react';
import { simulationUsers, selectSimulationUser, createSimulationUser, confirmSimulationUser, simulationMedia } from '@/lib/simulation';
import type { Evidence } from '@/lib/types';

export function SimulationAuth({done}:{done:(message:string)=>void}){
 const [users,setUsers]=useState<ReturnType<typeof simulationUsers>>([]),[name,setName]=useState(''),[pending,setPending]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{try{setUsers(simulationUsers());}catch(e){setError((e as Error).message);}},[]);
 return <div className="simulation-auth"><p>Try a test account or create your own. No email or password needed.</p><div className="test-accounts">{users.map(user=><button key={user.id} className="test-account" onClick={async()=>{try{if(user.confirmed)selectSimulationUser(user.id);else await confirmSimulationUser(user.id);done(`Using ${user.display_name}.`);}catch(e){setError((e as Error).message);}}}><Users size={17}/><span><strong>{user.display_name}</strong><small>{!user.confirmed?'Confirm test account':user.role==='moderator'?'Test moderator':'Test reporter'}</small></span><ArrowRight size={16}/></button>)}</div>
 {!pending?<form className="form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const user=await createSimulationUser(name);setPending(user.id);setUsers(simulationUsers());}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><label>Your test display name<input minLength={2} maxLength={40} required value={name} onChange={e=>setName(e.target.value)} placeholder="For example: Downtown neighbor" autoComplete="off"/></label><button className="primary" disabled={busy}>Create test account</button></form>:<div className="sim-confirm"><Check size={20}/><h3>Confirm your test account</h3><p>This button simulates opening a confirmation email. Nothing is sent.</p><button className="primary" disabled={busy} onClick={async()=>{setBusy(true);try{await confirmSimulationUser(pending);done('Test account confirmed. You can now report.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Confirm & continue</button></div>}
 {error&&<p className="form-error" role="alert">{error}</p>}<small className="simulation-footnote">Saved in this browser only. Test identities and private-media access are simulated, not secure accounts.</small></div>;
}

export function SimulationEvidence({evidence,original=false}:{evidence:Evidence;original?:boolean}){
 const [url,setUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>{if(original||!evidence.preview_path)return;let active=true,objectUrl='';simulationMedia(evidence.id).then(blob=>{if(active){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}}).catch(()=>{if(active)setError('Preview unavailable.');});return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[evidence.id,evidence.preview_path,original]);
 if(original)return <><button type="button" className="text-button" onClick={async()=>{try{const blob=await simulationMedia(evidence.id,true),objectUrl=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=`fieldnote-${evidence.id}.${evidence.mime.split('/')[1]}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),10000);}catch(e){setError((e as Error).message);}}}><Download size={13}/>Download test original</button>{error&&<small role="status">{error}</small>}</>;
 return <>{url&&<img src={url} alt="Consented image preview from a simulated report" loading="lazy"/>}{error&&<small role="status">{error}</small>}</>;
}
