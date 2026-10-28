import { assess } from './assessment';
import { normalize, eventCategories } from './discovery';
import { createStarterEvents } from './starter-events';
import type { FieldEvent, Report, Evidence } from './types';

export type SimUser={id:string;display_name:string;email:string;role:'member'|'moderator';confirmed:boolean};
type SimEvent=FieldEvent&{state:string;merged_into?:string};
type Concern={id:string;user_id:string;event_id:string;report_id?:string;reason:string;kind:string;resolved:boolean;created_at:string};
type Audit={id:string;actor_id:string;event_id:string;action:string;reason:string;details:Record<string,any>;created_at:string};
type Intent={id:string;user_id:string;report_id:string;expires_at:string;created_at:string;state:'pending'|'complete'};
export type SimState={version:1;users:SimUser[];events:SimEvent[];follows:{user_id:string;event_id:string;created_at:string}[];concerns:Concern[];audit:Audit[];intents:Intent[];history:{event_id:string;score:number|null;factors:unknown;recorded_at:string}[]};
const id=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
export function freshSimulation():SimState{return {version:1,users:[],events:createStarterEvents().map(event=>({...event,state:'visible'})),follows:[],concerns:[],audit:[],intents:[],history:[]};}
export function requireSimUser(state:SimState,userId:string|null){const user=state.users.find(u=>u.id===userId);if(!user?.confirmed)throw new Error('Choose or confirm a simulated account first.');return user;}
export function recalculate(state:SimState){for(const e of state.events){const reports=e.reports.filter(r=>r.state==='visible');const latest=reports.map(r=>r.created_at).sort().at(-1)??null;const captures=new Set(reports.flatMap(r=>r.evidence.map(v=>v.sha256))).size;Object.assign(e,{latest_report_at:latest,...assess(new Set(reports.map(r=>r.author_id)).size,captures,latest,e.status==='corroborated',e.status==='conflicting')});const last=state.history.filter(h=>h.event_id===e.id).at(-1);if(!last||last.score!==e.score||JSON.stringify(last.factors)!==JSON.stringify(e.factors))state.history.push({event_id:e.id,score:e.score,factors:e.factors,recorded_at:now()});}state.history=state.history.slice(-1000);}
export function publicSimulation(state:SimState):FieldEvent[]{recalculate(state);return state.events.filter(e=>e.state==='visible').map(e=>({...e,reports:e.reports.filter(r=>r.state==='visible').map(r=>({...r,display_name:state.users.find(u=>u.id===r.author_id)?.display_name??r.display_name}))}));}
function validText(value:unknown,min:number,max:number,label:string){if(typeof value!=='string'||value.trim().length<min||value.length>max)throw new Error(`Check ${label}.`);return value.trim();}
function audit(state:SimState,user:SimUser,eventId:string,action:string,reason:string,details:Record<string,any>){state.audit.push({id:id(),actor_id:user.id,event_id:eventId,action,reason,details,created_at:now()});}
function eventFor(state:SimState,eid:string){let e=state.events.find(e=>e.id===eid);while(e?.merged_into)e=state.events.find(x=>x.id===e!.merged_into);if(!e||e.state!=='visible')throw new Error('This event is unavailable.');return e;}
export function applySimulation(state:SimState,userId:string|null,operation:string,p:any):any{
 const user=requireSimUser(state,userId);
 const allReports=()=>state.events.flatMap(e=>e.reports);
 let result:any={ok:true};
 if(operation==='create'||operation==='report'){
  if(allReports().filter(r=>r.author_id===user.id&&Date.parse(r.created_at)>Date.now()-86400000).length>=12)throw new Error('12 reports per 24 hours reached.');
  const body=validText(p.body,20,4000,'your observation');const observed=Date.parse(p.observed_at);if(!Number.isFinite(observed)||observed>Date.now()+300000)throw new Error('Check the observation time.');
  let event:SimEvent|undefined;let grouped=false;
  if(operation==='create'){
   const title=validText(p.title,8,140,'the headline'),location=validText(p.location,3,120,'the location');if(!eventCategories.includes(p.category))throw new Error('Choose a theme.');
   if(!p.distinct_event)event=state.events.find(e=>e.state==='visible'&&normalize(e.title)===normalize(title)&&normalize(e.location)===normalize(location)&&e.reports.some(r=>r.state==='visible'&&Math.abs(Date.parse(r.observed_at)-observed)<=21600000));
   grouped=!!event;
   if(!event){event={id:id(),title,location,category:p.category,status:'open',state:'visible',created_at:now(),latest_report_at:null,score:null,factors:{accounts:0,provenance:0,recency:0,moderator:0,conflict:0},reports:[]};state.events.push(event);}
  }else event=eventFor(state,p.event_id);
  const previous=event.reports.find(r=>r.author_id===user.id);if(previous){if(operation==='create')return {event_id:event.id,report_id:previous.id,grouped:true,already_reported:true};throw new Error('You already reported this event. Use Correct account.');}
  const report:Report={id:id(),event_id:event.id,author_id:user.id,display_name:user.display_name,body,observed_at:new Date(observed).toISOString(),created_at:now(),assisted:!!p.assisted,state:'visible',evidence:[]};event.reports.push(report);result={event_id:event.id,report_id:report.id,grouped};
 }else if(operation==='correct'){
  const report=allReports().find(r=>r.id===p.report_id&&r.author_id===user.id);if(!report)throw new Error('Report unavailable.');const body=validText(p.body,20,4000,'your observation'),reason=validText(p.reason,10,2000,'the correction reason');if(!Number.isFinite(Date.parse(p.observed_at))||Date.parse(p.observed_at)>Date.now()+300000)throw new Error('Check observation time.');audit(state,user,report.event_id,'correction',reason,{report_id:report.id,previous_body:report.body});Object.assign(report,{body,observed_at:p.observed_at,assisted:!!p.assisted});result={event_id:report.event_id,report_id:report.id};
 }else if(operation==='follow'){
  const event=eventFor(state,p.event_id);state.follows=state.follows.filter(f=>!(f.user_id===user.id&&f.event_id===event.id));if(p.following)state.follows.push({user_id:user.id,event_id:event.id,created_at:now()});
 }else if(operation==='flag'||operation==='appeal'){
  const event=state.events.find(e=>e.id===p.event_id);if(!event)throw new Error('Event unavailable.');if(p.report_id&&!event.reports.some(r=>r.id===p.report_id))throw new Error('Report unavailable.');if(state.concerns.filter(c=>c.user_id===user.id&&Date.parse(c.created_at)>Date.now()-86400000).length>=20)throw new Error('Daily concern limit reached.');state.concerns.push({id:id(),user_id:user.id,event_id:event.id,report_id:p.report_id,reason:validText(p.reason,10,2000,'the reason'),kind:operation,resolved:false,created_at:now()});
 }else if(operation==='moderate'||operation==='merge'){
  if(user.role!=='moderator')throw new Error('Choose the simulated moderator to review reports.');const reason=validText(p.reason,10,2000,'the review reason'),notice=validText(p.public_notice,10,2000,'the witness explanation');const event=state.events.find(e=>e.id===p.event_id);if(!event)throw new Error('Event unavailable.');
  if(operation==='moderate'){
   if(p.report_id){const report=event.reports.find(r=>r.id===p.report_id);if(!report||!['visible','quarantined','removed'].includes(p.state))throw new Error('Invalid report decision.');report.state=p.state;}
   else if(['visible','quarantined','removed'].includes(p.state))event.state=p.state;
   else if(['open','under_review','corroborated','conflicting'].includes(p.state))event.status=p.state;else throw new Error('Invalid decision.');
   const concern=state.concerns.find(c=>c.id===p.concern_id&&c.event_id===event.id);if(concern)concern.resolved=true;
  }else{
   const source=eventFor(state,p.source_event_id);if(source.id===event.id||event.state!=='visible')throw new Error('Choose two visible events.');if(source.reports.some(r=>event.reports.some(t=>t.author_id===r.author_id)))throw new Error('An account reported in both events. No report was discarded.');
   for(const report of source.reports){report.event_id=event.id;event.reports.push(report);}source.reports=[];source.state='removed';source.merged_into=event.id;
   for(const follow of state.follows)if(follow.event_id===source.id)follow.event_id=event.id;state.follows=state.follows.filter((f,i,a)=>a.findIndex(x=>x.user_id===f.user_id&&x.event_id===f.event_id)===i);
   for(const concern of state.concerns)if(concern.event_id===source.id)concern.event_id=event.id;for(const row of state.audit)if(row.event_id===source.id)row.event_id=event.id;event.status=event.status==='conflicting'||source.status==='conflicting'?'conflicting':'under_review';result={event_id:event.id,grouped:true};
  }
  audit(state,user,event.id,'moderation',reason,{report_id:p.report_id,public_notice:notice,state:p.state,source_event_id:p.source_event_id});
 }else if(operation==='deletion'){
  for(const event of state.events)event.reports=event.reports.filter(r=>r.author_id!==user.id);state.events=state.events.filter(e=>e.reports.length>0);state.users=state.users.filter(u=>u.id!==user.id);state.follows=state.follows.filter(f=>f.user_id!==user.id&&state.events.some(e=>e.id===f.event_id));state.concerns=state.concerns.filter(c=>c.user_id!==user.id&&state.events.some(e=>e.id===c.event_id));state.audit=state.audit.filter(a=>a.actor_id!==user.id&&state.events.some(e=>e.id===a.event_id));state.intents=state.intents.filter(i=>i.user_id!==user.id);state.history=state.history.filter(h=>state.events.some(e=>e.id===h.event_id));
 }else throw new Error('Unknown action.');
 recalculate(state);return result;
}
export function simulationAccount(state:SimState,userId:string|null){const user=requireSimUser(state,userId);const reports=state.events.flatMap(e=>e.reports.filter(r=>r.author_id===user.id));return {id:user.id,profile:{display_name:user.display_name,role:user.role},follows:state.follows.filter(f=>f.user_id===user.id),concerns:state.concerns.filter(c=>c.user_id===user.id),reports,deletion:[],decisions:state.audit.filter(a=>a.action==='moderation'&&reports.some(r=>r.event_id===a.event_id&&(!a.details.report_id||r.id===a.details.report_id))).map(a=>({id:a.id,notice:a.details.public_notice,created_at:a.created_at}))};}
export function simulationQueue(state:SimState,userId:string|null){if(requireSimUser(state,userId).role!=='moderator')throw new Error('Moderator access required.');return {events:state.events,reports:state.events.flatMap(e=>e.reports),concerns:state.concerns,audit:state.audit};}
