import {test} from 'node:test';import assert from 'node:assert/strict';
import {freshSimulation,applySimulation,publicSimulation,simulationAccount,simulationQueue} from '../lib/simulation-core';

test('Simulation groups reports, prevents duplicate accounts and preserves changes across reload serialization',()=>{
 let state=freshSimulation();state.users.push({id:'reporter-a',display_name:'Reporter A',email:'local-a@fieldnote.local',role:'member',confirmed:true},{id:'reporter-b',display_name:'Reporter B',email:'local-b@fieldnote.local',role:'member',confirmed:true});const p={title:'Coffee pop-up beside the library',location:'Downtown library area',category:'Food & drink',body:'I saw a coffee stand outside near the library entrance.',observed_at:new Date().toISOString()};
 const first=applySimulation(state,'reporter-a','create',p),second=applySimulation(state,'reporter-b','create',p);assert.equal(first.event_id,second.event_id);assert.equal(second.grouped,true);
 assert.equal(applySimulation(state,'reporter-b','create',p).already_reported,true);
 state=JSON.parse(JSON.stringify(state));const event=publicSimulation(state).find(e=>e.id===first.event_id)!;assert.equal(event.reports.length,2);assert.equal(event.factors.accounts,1);
 applySimulation(state,'reporter-a','follow',{event_id:event.id,following:true});assert.equal(simulationAccount(state,'reporter-a').follows.length,1);
 applySimulation(state,'reporter-a','correct',{report_id:first.report_id,body:'I saw a coffee stand outside the east library entrance.',observed_at:p.observed_at,reason:'Clarifying which entrance I observed.'});assert.match(simulationAccount(state,'reporter-a').reports.find(r=>r.id===first.report_id)!.body,/east/);
});

test('Simulation handles review, appeals, restoration and account deletion',()=>{
 const state=freshSimulation();state.users.push({id:'member-a',display_name:'Member A',email:'local-a@fieldnote.local',role:'member',confirmed:true},{id:'member-b',display_name:'Member B',email:'local-b@fieldnote.local',role:'member',confirmed:true},{id:'moderator',display_name:'Moderator',email:'local-mod@fieldnote.local',role:'moderator',confirmed:true});const p={title:'Riverfront gathering draws a crowd',location:'Downtown Sioux Falls',category:'Community',body:'I saw people gathering along the riverfront near the public walkway.',observed_at:new Date().toISOString()};const first=applySimulation(state,'member-a','create',p),event=state.events.find(e=>e.id===first.event_id)!;applySimulation(state,'member-b','report',{event_id:event.id,body:'I walked past and saw a group gathered at the riverfront walkway.',observed_at:p.observed_at});
 assert.throws(()=>applySimulation(state,null,'follow',{event_id:event.id,following:true}),/simulated account/);
 assert.throws(()=>simulationQueue(state,'member-a'),/Moderator/);
 applySimulation(state,'member-b','flag',{event_id:event.id,reason:'Please review the location on this event.'});const concern=state.concerns[0];
 assert.throws(()=>applySimulation(state,'member-a','moderate',{event_id:event.id,reason:'Needs a detailed review.',public_notice:'We are reviewing this report.',state:'quarantined'}),/moderator/);
 applySimulation(state,'moderator','moderate',{event_id:event.id,report_id:first.report_id,concern_id:concern.id,reason:'Review the witness location carefully.',public_notice:'This report is temporarily under review.',state:'quarantined'});
 assert.equal(state.concerns[0].resolved,true);assert.equal(publicSimulation(state).find(e=>e.id===event.id)!.reports.length,1);
 applySimulation(state,'member-a','appeal',{event_id:event.id,report_id:first.report_id,reason:'Please check the location clarification.'});
 applySimulation(state,'moderator','moderate',{event_id:event.id,report_id:first.report_id,reason:'The clarification resolves the concern.',public_notice:'Your report has been restored.',state:'visible'});
 assert.ok(simulationAccount(state,'member-a').decisions.some(d=>d.notice.includes('restored')));
 applySimulation(state,'member-a','deletion',{});assert.ok(!state.users.some(u=>u.id==='member-a'));assert.ok(state.events.every(e=>e.reports.every(r=>r.author_id!=='member-a')));assert.ok(!state.audit.some(a=>a.actor_id==='member-a'));assert.throws(()=>simulationAccount(state,'member-a'),/simulated account/);
});

test('Unconfirmed simulated accounts cannot post and account limits still apply',()=>{
 const state=freshSimulation();state.users.push({id:'pending',display_name:'Pending',email:'pending@example.test',role:'member',confirmed:false});
 const p={title:'Another local news observation',location:'Downtown Sioux Falls',category:'Local news',body:'I saw a community notice being posted at the entrance.',observed_at:new Date().toISOString()};
 assert.throws(()=>applySimulation(state,'pending','create',p),/confirm/);
 state.users.push({id:'rate-test',display_name:'Rate test',email:'rate@example.test',role:'member',confirmed:true});
 for(let i=0;i<12;i++)applySimulation(state,'rate-test','create',{...p,title:`Another local news observation ${i}`});
 assert.throws(()=>applySimulation(state,'rate-test','create',{...p,title:'Thirteenth local observation'}),/12 reports/);
});
