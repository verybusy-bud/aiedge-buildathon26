'use client';
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { createSimulationUser, signInSimulationUser, simulationMedia } from '@/lib/simulation';
import type { Evidence } from '@/lib/types';

export function SimulationAuth({done}:{done:(message:string)=>void}){
 const [signup,setSignup]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <div className="simulation-auth"><p>{signup?'Create an account to join the Sioux Falls community.':'Sign in to continue to your Fieldnote account.'}</p>
 <form className="form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);try{const user=signup?await createSimulationUser(String(f.get('username')),String(f.get('email')),String(f.get('password'))):await signInSimulationUser(String(f.get('email')),String(f.get('password')));done(`Welcome, ${user.display_name}.`);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{signup&&<label>Username<input name="username" minLength={2} maxLength={40} required autoComplete="username"/></label>}<label>Email address<input name="email" type="email" required autoComplete="email"/></label><label>Password<input name="password" type="password" required minLength={12} autoComplete={signup?'new-password':'current-password'}/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Please wait…':signup?'Create account':'Sign in'}</button></form>
 <button type="button" className="text-button" onClick={()=>{setSignup(!signup);setError('');}}>{signup?'Already have an account? Sign in':'New here? Create an account'}</button><small className="simulation-footnote">Accounts and posts stay in this browser. No confirmation email is sent; this is not a shared online account.</small></div>;
}

export function SimulationEvidence({evidence,original=false}:{evidence:Evidence;original?:boolean}){
 const [url,setUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>{if(original||!evidence.preview_path)return;let active=true,objectUrl='';simulationMedia(evidence.id).then(blob=>{if(active){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}}).catch(()=>{if(active)setError('Preview unavailable.');});return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[evidence.id,evidence.preview_path,original]);
 if(original)return <><button type="button" className="text-button" onClick={async()=>{try{const blob=await simulationMedia(evidence.id,true),objectUrl=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=`fieldnote-${evidence.id}.${evidence.mime.split('/')[1]}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),10000);}catch(e){setError((e as Error).message);}}}><Download size={13}/>Download original</button>{error&&<small role="status">{error}</small>}</>;
 return <>{url&&<img src={url} alt="Consented image preview" loading="lazy"/>}{error&&<small role="status">{error}</small>}</>;
}
