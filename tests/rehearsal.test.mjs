import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const app=path.resolve(fileURLToPath(new URL('../app/',import.meta.url)));
const runtime={CASE_AI_PROVIDER:'scripted'};globalThis.__rehearsalTestEnv=runtime;
const modules=new Map();
async function moduleURL(filename){
 filename=path.resolve(filename);if(modules.has(filename))return modules.get(filename);
 if(filename.endsWith('.json')){const value=JSON.parse(await fs.readFile(filename,'utf8'));const url='data:text/javascript;base64,'+Buffer.from('export default '+JSON.stringify(value)).toString('base64');modules.set(filename,url);return url;}
 let code=ts.transpileModule((await fs.readFile(filename,'utf8')).replace(/import ['"]server-only['"];?/g,''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const specifier of [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match=>match[1])){let url;
  if(specifier==='cloudflare:workers')url='data:text/javascript,export const env=globalThis.__rehearsalTestEnv';
  else if(specifier.startsWith('.')){let resolved=path.resolve(path.dirname(filename),specifier);if(!path.extname(resolved))resolved+='.ts';url=await moduleURL(resolved);}else continue;
  code=code.replaceAll("'"+specifier+"'",JSON.stringify(url)).replaceAll('"'+specifier+'"',JSON.stringify(url));
 }
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');modules.set(filename,url);return url;
}
const engine=await import(await moduleURL(path.join(app,'lib/server/engine.ts')));
const store=await import(await moduleURL(path.join(app,'lib/server/store.ts')));
const actions=await import(await moduleURL(path.join(app,'api/action/route.ts')));
const joins=await import(await moduleURL(path.join(app,'api/rehearsal/route.ts')));

function fixture(){
 const liveEvent=engine.createEvent();liveEvent.ownerProviderId='rehearsal-host-provider';liveEvent.facilitators=[{id:'rehearsal-host-owner',name:'Owner',email:'ashmitavash@gmail.com',providerId:'rehearsal-host-provider'}];liveEvent.controllerId='rehearsal-host-owner';const live=JSON.stringify(liveEvent),rows=new Map([['live',{state_json:live,revision:0}]]),sessions=new Map();let conflicts=0,updates=0;const hooks={forceConflicts:0,networkAfterUpdate:false};
 const statement=(sql,values=[])=>({bind(...args){return statement(sql,args)},async first(){
  if(sql.includes('case_rate_limits'))return {hits:1};
  if(sql.includes('FROM case_events'))return rows.has(values[0])?{...rows.get(values[0])}:null;
  if(sql.includes('FROM case_sessions')){const session=sessions.get(values[0]);return session&&session.expires_at>values[1]?session:null;}
  if(sql.includes('case_ai_status'))return null;throw Error('Unexpected read: '+sql);
 },execute(){
  if(sql.startsWith('INSERT OR IGNORE INTO case_events')){if(rows.has(values[0]))return {meta:{changes:0}};rows.set(values[0],{state_json:values[1],revision:0});return {meta:{changes:1}};}
  if(sql.startsWith('INSERT INTO case_events')){rows.set(values[0],{state_json:values[1],revision:0});return {meta:{changes:1}};}
  if(sql.startsWith('INSERT INTO case_sessions')){if(sql.includes('WHERE EXISTS')&&rows.get(values[4])?.revision!==values[5])return {meta:{changes:0}};sessions.set(values[0],{event_id:values[1],participant_id:values[2],expires_at:values[3]});return {meta:{changes:1}};}
  if(sql.startsWith('UPDATE case_events')){updates++;const row=rows.get(values[2]);if(!row||row.revision!==values[3]){conflicts++;return {meta:{changes:0}};}rows.set(values[2],{state_json:values[0],revision:row.revision+1});if(hooks.networkAfterUpdate){hooks.networkAfterUpdate=false;throw Error('D1_ERROR: simulated connection lost after committed write');}return {meta:{changes:1}};}
  if(sql.startsWith('DELETE FROM case_sessions')){sessions.delete(values[0]);return {meta:{changes:1}};}
  throw Error('Unexpected write: '+sql);
 },async run(){return this.execute()}});
 runtime.DB={prepare:statement,async batch(statements){if(hooks.forceConflicts>0){hooks.forceConflicts--;conflicts++;updates++;return statements.map(()=>({meta:{changes:0}}));}return statements.map(item=>item.execute())}};
 const request=(endpoint,input,cookie)=>new Request('https://case.example.test'+endpoint,{method:'POST',headers:{origin:'https://case.example.test','content-type':'application/json',...(cookie?{cookie}:input.type==='startRehearsal'?{'oai-authenticated-user-id':'rehearsal-host-provider','oai-authenticated-user-email':'ashmitavash@gmail.com'}:{})},body:JSON.stringify(input)});
 async function action(cookie,input,status=200){const response=await actions.POST(request('/api/action',input,cookie));const data=await response.json();assert.equal(response.status,status,JSON.stringify({type:input.type,error:data.error}));return{data,cookie:response.headers.get('set-cookie')?.split(';')[0]??cookie};}
 async function join(roomId,invite,name,cookie,status=200,extra={}){const response=await joins.POST(request('/api/rehearsal',{roomId,inviteToken:invite.token,name,...extra},cookie));const data=await response.json();assert.equal(response.status,status,JSON.stringify({name,error:data.error}));return{data,cookie:response.headers.get('set-cookie')?.split(';')[0]??cookie};}
 async function state(cookie){const current=await store.context(new Request('https://case.example.test/api/state',{headers:cookie?{cookie}:{}}));return store.responseState(current,current.actor);}
 return {rows,sessions,live,action,join,state,hooks,get conflicts(){return conflicts},get updates(){return updates}};
}
async function populated(f,participantCount){const host=await f.action(null,{type:'startRehearsal',...(participantCount===undefined?{}:{participantCount})});const players=await Promise.all(host.data.rehearsalInvites.map((invite,i)=>f.join(host.data.state.id,invite,'Player '+(i+1))));return{host,players};}
async function opening(f,host){let data=host.data;for(const panel of data.state.opening.panels){await f.action(host.cookie,{type:'openingSelect',sceneId:panel.id,choiceId:panel.choices[0].id});data=(await f.action(host.cookie,{type:'openingNext'})).data;}return data;}

test('creation is isolated, stores invite hashes only, and exposes raw invites only in host issuance',async()=>{
 const f=fixture(),host=await f.action(null,{type:'startRehearsal'}),{state,viewer,rehearsalInvites}=host.data;
 assert.equal(state.mode,'demo');assert.equal(viewer.role,'admin');assert.equal(viewer.isOwner,false);assert.equal(state.phase,1);assert.equal(state.participants.length,8);assert.equal(state.suspects.length,6);assert.equal(state.suspects.filter(s=>s.approved).length,0);assert.equal(state.reveal,null);
 assert.equal(rehearsalInvites.length,8);assert.equal(rehearsalInvites.filter(i=>i.role==='detective').length,2);assert.equal(new Set(rehearsalInvites.map(i=>i.token)).size,8);
 const saved=f.rows.get(state.id).state_json;for(const invite of rehearsalInvites){assert.match(invite.token,/^[a-f0-9]{64}$/);assert.ok(!saved.includes(invite.token));}
 assert.equal((await f.state(host.cookie)).rehearsalInvites,undefined);assert.ok(!JSON.stringify(await f.state(host.cookie)).includes('"hash"'));assert.equal(f.rows.get('live').state_json,f.live);
 await f.action(host.cookie,{type:'assignSuspects',count:5},400);await f.action(host.cookie,{type:'importRoster',entries:[]},400);await f.action(host.cookie,{type:'setFacilitator',name:'Other',email:'other@example.invalid'},403);
});

test('eight simultaneous fixed-seat claims have distinct cookies and participants; reuse and promotion fail',async()=>{
 const f=fixture(),{host,players}=await populated(f);
 assert.equal(new Set(players.map(p=>p.cookie)).size,8);assert.equal(new Set(players.map(p=>p.data.viewer.id)).size,8);assert.ok(players.every(p=>p.data.state.id===host.data.state.id));assert.ok(players.every(p=>!p.data.state.admin&&!p.data.rehearsalInvites&&!p.data.viewer.canControl));assert.equal(players.filter(p=>p.data.viewer.role==='suspect').length,6);assert.equal(f.sessions.size,9);
 const latest=await f.state(host.cookie);assert.ok(latest.state.rehearsal.seats.every(seat=>seat.joined));assert.ok(f.conflicts>0,'Concurrent claims must exercise CAS retries');
 await f.join(host.data.state.id,host.data.rehearsalInvites[0],'Another visitor',null,409);
 await f.join(host.data.state.id,{token:'0'.repeat(64)},'Invalid',null,403);
 await f.join(host.data.state.id,host.data.rehearsalInvites[0],'Promote',null,400,{role:'admin'});
 const same=await f.join(host.data.state.id,host.data.rehearsalInvites[0],'Player 1',players[0].cookie);assert.equal(same.data.viewer.id,players[0].data.viewer.id);assert.equal(f.sessions.size,9);
 assert.equal(f.rows.get('live').state_json,f.live);
});

test('fifteen simultaneous seats retain full writing gate, six concurrent revisions, private prompts and fifteen votes',async()=>{
 const f=fixture(),{host,players}=await populated(f,15),writers=players.filter(p=>p.data.viewer.role==='suspect');
 await f.action(host.cookie,{type:'setPhase',phase:2},400);await opening(f,host);
 const writing=(await f.action(host.cookie,{type:'setPhase',phase:2})).data;assert.equal(writing.state.promptDeadline-writing.state.phaseStartedAt,360000);
 const prompts=writers.map((writer,i)=>({...writer.data.viewer.ownPrompt,characterName:'Rehearsal Character '+(i+1),publicAlibi:'I was checking the records at station '+(i+1)+'.',privateSecret:'PRIVATE_SENTINEL_'+(i+1),personality:'Careful and concise voice '+(i+1)+'.'}));
 await f.action(host.cookie,{type:'reviewPrompt',suspectId:writers[0].data.viewer.suspectId,approve:true},400);
 await Promise.all(writers.map((writer,i)=>f.action(writer.cookie,{type:'submitPrompt',prompt:prompts[i]})));
 let current=await f.state(host.cookie);assert.equal(current.state.admin.submissions.length,6);assert.equal(new Set(current.state.admin.submissions.map(s=>s.prompt.privateSecret)).size,6);
 const revised=prompts.map(p=>({...p,publicAlibi:p.publicAlibi+' This is my personal claim, not independent proof.'}));
 await Promise.all(writers.map((writer,i)=>f.action(writer.cookie,{type:'submitPrompt',prompt:revised[i]})));
 current=await f.state(host.cookie);assert.equal(current.state.admin.submissions.length,6);
 for(let i=0;i<writers.length;i++){
  const own=await f.state(writers[i].cookie);assert.deepEqual(own.viewer.ownPrompt,revised[i]);assert.equal(own.state.admin,undefined);assert.equal(own.state.reveal,null);
  for(let j=0;j<writers.length;j++)if(i!==j)assert.ok(!JSON.stringify(own).includes(prompts[j].privateSecret));
  await f.action(host.cookie,{type:'reviewPrompt',suspectId:writers[i].data.viewer.suspectId,approve:true});
 }
 for(const detective of players.filter(player=>player.data.viewer.role==='detective')){const data=await f.state(detective.cookie);assert.equal(data.viewer.ownPrompt,undefined);assert.ok(!JSON.stringify(data).includes('PRIVATE_SENTINEL_'));await f.action(detective.cookie,{type:'claimControl'},403);}
 await f.action(host.cookie,{type:'setPhase',phase:3},400);const now=Date.now;Date.now=()=>writing.state.promptDeadline;
 try{current=(await f.action(host.cookie,{type:'setPhase',phase:3})).data;}finally{Date.now=now;}
 assert.equal(current.state.phase,3);assert.deepEqual(current.state.suspects.map(s=>s.publicAlibi),revised.map(p=>p.publicAlibi));
 for(const player of players)await f.action(player.cookie,{type:'interrogate',suspectId:current.state.suspects[0].id,message:'Who are you?'},403);
 await f.action(host.cookie,{type:'beginAccusation'},400);await f.action(host.cookie,{type:'finishCase'},400);
 await f.action(host.cookie,{type:'setPhase',phase:4});await f.action(host.cookie,{type:'setPhase',phase:5});await f.action(host.cookie,{type:'setPoll',open:true});
 await Promise.all(players.map((player,i)=>f.action(player.cookie,{type:'vote',suspectId:current.state.suspects[i%6].id})));
 const ballot=await f.state(host.cookie);assert.equal(ballot.state.voteTotal,15);await f.action(players[0].cookie,{type:'vote',suspectId:current.state.suspects[0].id},409);await f.action(host.cookie,{type:'vote',suspectId:current.state.suspects[0].id},403);
 await f.action(host.cookie,{type:'setPoll',open:false});await f.action(host.cookie,{type:'reveal'});await f.action(host.cookie,{type:'setPhase',phase:6});
 const endings=await Promise.all(players.map(player=>f.state(player.cookie)));assert.ok(endings.every(data=>data.state.phase===6&&data.state.revealed&&data.state.voteTotal===15&&!data.state.admin));assert.equal(new Set(endings.map(data=>data.state.reveal.killerId)).size,1);assert.equal(f.rows.get('live').state_json,f.live);
});

test('all seats must join; replacement invalidates only unused invites and expiry is enforced',async()=>{
 const f=fixture(),host=await f.action(null,{type:'startRehearsal'}),first=await f.join(host.data.state.id,host.data.rehearsalInvites[0],'First');
 await opening(f,host);await f.action(host.cookie,{type:'setPhase',phase:2},400);
 await f.action(first.cookie,{type:'refreshRehearsalInvites'},403);
 const replaced=(await f.action(host.cookie,{type:'refreshRehearsalInvites'})).data.rehearsalInvites;assert.equal(replaced.length,7);assert.ok(!replaced.some(invite=>invite.participantId===first.data.viewer.id));
 await f.join(host.data.state.id,host.data.rehearsalInvites[1],'Old link',null,403);await f.join(host.data.state.id,replaced[0],'New link');
 const row=f.rows.get(host.data.state.id),event=JSON.parse(row.state_json);event.rehearsal.expiresAt=Date.now()-1;row.state_json=JSON.stringify(event);
 await f.join(host.data.state.id,replaced[1],'Expired link',null,410);await f.action(host.cookie,{type:'refreshRehearsalInvites'},410);
});

test('simultaneous reuse of one invitation issues only one session',async()=>{
 const f=fixture(),host=await f.action(null,{type:'startRehearsal'}),invite=host.data.rehearsalInvites[0];
 const requests=Array.from({length:6},(_,i)=>new Request('https://case.example.test/api/rehearsal',{method:'POST',headers:{origin:'https://case.example.test','content-type':'application/json'},body:JSON.stringify({roomId:host.data.state.id,inviteToken:invite.token,name:'Claimant '+i})}));
 const results=await Promise.all(requests.map(request=>joins.POST(request)));assert.equal(results.filter(response=>response.status===200).length,1);assert.equal(results.filter(response=>response.status===409).length,5);assert.equal(f.sessions.size,2);
});


test('rehearsal capacity is bounded, preserves the default, and requires every generated seat to join',async()=>{
 const f=fixture();for(const participantCount of [7,16,8.5,null,'15']){await f.action(null,{type:'startRehearsal',participantCount},400);assert.equal(f.rows.size,1);assert.equal(f.sessions.size,0);}
 for(const count of [10,15]){const host=await f.action(null,{type:'startRehearsal',participantCount:count});assert.equal(host.data.rehearsalInvites.length,count);assert.equal(host.data.state.suspects.length,6);assert.equal(host.data.rehearsalInvites.filter(i=>i.role==='detective').length,count-6);const invitations=host.data.rehearsalInvites;await Promise.all(invitations.slice(0,-1).map((invite,i)=>f.join(host.data.state.id,invite,'Player '+i)));await opening(f,host);await f.action(host.cookie,{type:'setPhase',phase:2},400);await f.join(host.data.state.id,invitations.at(-1),'Last player');await f.action(host.cookie,{type:'setPhase',phase:2});}
 assert.equal(f.rows.get('live').state_json,f.live);
});

test('known revision conflicts retry beyond eight attempts but remain bounded',async()=>{
 const f=fixture(),host=await f.action(null,{type:'startRehearsal',participantCount:15});f.hooks.forceConflicts=10;const joined=await f.join(host.data.state.id,host.data.rehearsalInvites[0],'After contention');assert.equal(joined.data.viewer.role,'detective');assert.equal(f.conflicts,10);
 f.hooks.forceConflicts=30;const before=f.updates;await f.join(host.data.state.id,host.data.rehearsalInvites[1],'Exhausted',null,409);assert.equal(f.updates-before,20);assert.equal(f.sessions.size,2);assert.equal(f.rows.get('live').state_json,f.live);
});

test('uncertain join and vote writes are never automatically replayed',async()=>{
 const f=fixture(),host=await f.action(null,{type:'startRehearsal'}),invite=host.data.rehearsalInvites[0];f.hooks.networkAfterUpdate=true;const before=f.updates;await f.join(host.data.state.id,invite,'Uncertain join',null,500);assert.equal(f.updates-before,1);assert.equal(f.sessions.size,2);assert.equal(JSON.parse(f.rows.get(host.data.state.id).state_json).rehearsal.invites.filter(i=>i.usedAt!==null).length,1);
 const player=await f.join(host.data.state.id,host.data.rehearsalInvites[1],'Voting participant');const row=f.rows.get(host.data.state.id),event=JSON.parse(row.state_json);event.phase=5;event.pollOpen=true;row.state_json=JSON.stringify(event);f.hooks.networkAfterUpdate=true;const voteBefore=f.updates;await f.action(player.cookie,{type:'vote',suspectId:event.suspects[0].id},500);assert.equal(f.updates-voteBefore,1);const saved=JSON.parse(f.rows.get(event.id).state_json);assert.equal(Object.keys(saved.votes).length,1);assert.equal(saved.votes[player.data.viewer.id],event.suspects[0].id);assert.equal(f.rows.get('live').state_json,f.live);
});
