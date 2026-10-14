import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const app=path.resolve(fileURLToPath(new URL('../app/',import.meta.url)));
const runtime={CASE_AI_PROVIDER:'scripted',CASE_OWNER_EMAIL:'ashmitavash@gmail.com'};
globalThis.__participantTestEnv=runtime;
const modules=new Map();
async function moduleURL(filename){
 filename=path.resolve(filename);if(modules.has(filename))return modules.get(filename);
 if(filename.endsWith('.json')){const value=JSON.parse(await fs.readFile(filename,'utf8'));const url='data:text/javascript;base64,'+Buffer.from('export default '+JSON.stringify(value)).toString('base64');modules.set(filename,url);return url;}
 let code=ts.transpileModule((await fs.readFile(filename,'utf8')).replace(/import ['"]server-only['"];?/g,''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const imports=[...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match=>match[1]);
 for(const specifier of imports){let url;
  if(specifier==='cloudflare:workers')url='data:text/javascript,export const env=globalThis.__participantTestEnv';
  else if(specifier.startsWith('.')){let resolved=path.resolve(path.dirname(filename),specifier);if(!path.extname(resolved))resolved+='.ts';url=await moduleURL(resolved);}
  else continue;
  code=code.replaceAll("'"+specifier+"'",JSON.stringify(url)).replaceAll('"'+specifier+'"',JSON.stringify(url));
 }
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');modules.set(filename,url);return url;
}
const engine=await import(await moduleURL(path.join(app,'lib/server/engine.ts')));
const store=await import(await moduleURL(path.join(app,'lib/server/store.ts')));
const auth=await import(await moduleURL(path.join(app,'api/auth/route.ts')));
function fixture(){
 const live=engine.createEvent();live.ownerProviderId='real-owner';live.facilitators=[{id:'live-owner',name:'Owner',email:'ashmitavash@gmail.com',providerId:'real-owner'}];
 const rows=new Map([['live',{state_json:JSON.stringify(live),revision:0}]]),sessions=new Map();const originalLive=rows.get('live').state_json;let liveReads=0;
 runtime.DB={prepare(sql){return{bind(...args){return{async first(){
  if(sql.includes('case_rate_limits'))return{hits:1};
  if(sql.includes('FROM case_events')){if(args[0]==='live')liveReads++;return rows.get(args[0])??null;}
  if(sql.includes('FROM case_sessions'))return sessions.get(args[0])??null;
  if(sql.includes('case_ai_status'))return null;
  throw Error('Unexpected read: '+sql);
 },async run(){
  if(sql.startsWith('INSERT OR IGNORE INTO case_events'))return{meta:{changes:0}};
  if(sql.startsWith('INSERT INTO case_events')){rows.set(args[0],{state_json:args[1],revision:0});return{meta:{changes:1}};}
  if(sql.startsWith('INSERT INTO case_sessions')){sessions.set(args[0],{event_id:args[1],participant_id:args[2]});return{meta:{changes:1}};}
  if(sql.startsWith('DELETE FROM case_sessions')){sessions.delete(args[0]);return{meta:{changes:1}};}
  if(sql.startsWith('UPDATE case_events')){const row=rows.get(args[2]);if(!row||row.revision!==args[3])return{meta:{changes:0}};rows.set(args[2],{state_json:args[0],revision:row.revision+1});return{meta:{changes:1}};}
  throw Error('Unexpected write: '+sql);
 }};}};}};
 const request=(input,cookie)=>new Request('https://case.example.test/api/auth',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://case.example.test',...(cookie?{cookie}:{}),'oai-authenticated-user-id':'real-owner','oai-authenticated-user-email':'ashmitavash@gmail.com'},body:JSON.stringify(input)});
 return{rows,sessions,originalLive,request,get liveReads(){return liveReads;}};
}
function beginFullWriting(event,actor){for(const panel of engine.snapshot(event,actor,0).state.opening.panels){engine.mutate(event,actor,{type:'openingSelect',sceneId:panel.id,choiceId:panel.choices[0].id});engine.mutate(event,actor,{type:'openingNext'});}engine.mutate(event,actor,{type:'beginWriting'});}

test('test email opens a new normal detective case even with an empty live roster and provider owner signed in',async()=>{
 const f=fixture();const response=await auth.POST(f.request({email:' TestUser@gmail.com '}));assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.viewer.role,'detective');assert.equal(data.viewer.isOwner,false);assert.equal(data.viewer.canControl,true);assert.equal(data.state.testSession,true);assert.equal(data.state.admin,undefined);assert.equal(data.state.phase,1);assert.equal(data.state.opening.panelIndex,0);assert.equal(data.state.promptDeadline,null);assert.equal(data.state.participants.length,50);assert.equal(data.state.suspects.length,6);assert.equal(data.state.reveal,null);assert.equal(f.liveReads,0);assert.equal(f.rows.get('live').state_json,f.originalLive);
 const cookie=response.headers.get('set-cookie').split(';')[0];const next=await store.context(new Request('https://case.example.test/api/state',{headers:{cookie,'oai-authenticated-user-id':'real-owner','oai-authenticated-user-email':'ashmitavash@gmail.com'}}));assert.equal(next.actor.role,'detective');assert.equal(next.event.id,data.state.id);assert.equal(next.event.playerOnly,true);
});
test('test email can exercise the six-minute writer form and only its own character becomes available',async()=>{
 const f=fixture();const response=await auth.POST(f.request({email:'testuser@gmail.com',testRole:'suspect'}));assert.equal(response.status,200);const data=await response.json();assert.equal(data.viewer.role,'suspect');assert.equal(data.state.phase,1);assert.equal(data.state.promptDeadline,null);assert.ok(data.viewer.ownPrompt);assert.equal(data.state.suspects.filter(s=>s.approved).length,0);assert.equal(data.state.admin,undefined);
 const event=JSON.parse(f.rows.get(data.state.id).state_json),actor=engine.actorFor(event,data.viewer.id,null);beginFullWriting(event,actor);assert.equal(event.promptDeadline-event.phaseStartedAt,360000);engine.mutate(event,actor,{type:'submitPrompt',prompt:{...data.viewer.ownPrompt,personality:'Precise, anxious, and careful with words.'}});assert.equal(event.phase,2);assert.equal(event.suspects.filter(s=>s.approved).length,1);engine.advanceParticipantTest(event,event.promptDeadline);assert.equal(event.phase,3);assert.ok(event.suspects.every(s=>s.approved));assert.equal(engine.snapshot(event,actor,0).viewer.role,'suspect');assert.equal(f.rows.get('live').state_json,f.originalLive);
});
test('test participant has no administrative mutations or early solution access',async()=>{
 const f=fixture();const response=await auth.POST(f.request({email:'testuser@gmail.com'}));const data=await response.json();const event=JSON.parse(f.rows.get(data.state.id).state_json),actor=engine.actorFor(event,data.viewer.id,null);
 for(const action of [{type:'importRoster',entries:[]},{type:'setFacilitator',name:'Intruder',email:'intruder@example.test'},{type:'setAiMode',mode:'local'},{type:'setPhase',phase:6},{type:'assignSuspects',count:5},{type:'reviewPrompt',suspectId:event.suspects[0].id,approve:true},{type:'setPoll',open:true},{type:'reveal'},{type:'publishReplay'}])assert.throws(()=>engine.mutate(event,actor,action),error=>error.status===403,action.type);
 assert.throws(()=>engine.mutate(event,actor,{type:'finishCase'}));assert.throws(()=>engine.mutate(event,actor,{type:'beginAccusation'}));assert.equal(event.revealed,false);assert.equal(engine.snapshot(event,actor,0).state.reveal,null);
 assert.equal(f.rows.get('live').state_json,f.originalLive);
});
test('test access cannot request an admin role and similar emails remain subject to the live allowlist',async()=>{
 const f=fixture();const invalid=await auth.POST(f.request({email:'testuser@gmail.com',testRole:'admin'}));assert.equal(invalid.status,400);assert.equal(f.rows.size,1);
 const similar=await auth.POST(f.request({email:'testuser+admin@gmail.com'}));assert.equal(similar.status,403);assert.equal(f.rows.size,1);
 const owner=await auth.POST(f.request({email:'ashmitavash@gmail.com'}));assert.equal(owner.status,403);assert.match((await owner.json()).error,/verified ChatGPT/);
});
test('separate test logins never share discoveries or overwrite the live event',async()=>{
 const f=fixture();const first=await auth.POST(f.request({email:'testuser@gmail.com'}));const initial=await first.json();const cookie=first.headers.get('set-cookie').split(';')[0];
 const second=await auth.POST(f.request({email:'testuser@gmail.com'},cookie));const fresh=await second.json();assert.notEqual(initial.state.id,fresh.state.id);assert.ok(fresh.state.evidence.every(e=>!e.discovered));assert.equal(f.sessions.size,1);assert.equal(f.rows.get('live').state_json,f.originalLive);assert.equal(f.liveReads,0);
});

test('local dialogue jobs contain only the current approved character and its own recent turns',async()=>{
 const event=engine.createParticipantTest('context-test','player'),actor=engine.actorFor(event,'player',null);beginFullWriting(event,actor);engine.advanceParticipantTest(event,event.promptDeadline);event.aiMode='local';const suspect=event.suspects[0];suspect.prompt.personality='Exact, nervous, and concise.';event.suspects[1].prompt.privateSecret='OTHER_PRIVATE_SECRET_SENTINEL';
 event.dialogue=[{id:'other',speaker:'Other',text:'OTHER_PRIVATE_SECRET_SENTINEL',kind:'answer',suspectId:event.suspects[1].id,timestamp:1},{id:'own-q',speaker:'Detective',text:'Were you alone?',kind:'question',suspectId:suspect.id,timestamp:2},{id:'own-a',speaker:suspect.prompt.characterName,text:'I was checking my work.',kind:'answer',suspectId:suspect.id,timestamp:3}];
 const prepared=engine.prepareDialogue(event,actor,suspect.id,'Where were you at 21:17?',false);let payload;const oldDB=runtime.DB;runtime.CASE_AI_PROVIDER='local';
 runtime.DB={prepare(sql){return{bind(...values){return{sql,values,async first(){if(sql.includes('case_ai_status'))return{last_heartbeat:Date.now(),model:'fixture'};if(sql.includes('case_ai_jobs'))return{status:'complete',result_text:prepared.answer,model:'fixture'};throw Error('Unexpected read');},async run(){return{meta:{changes:1}};}};}};},async batch(statements){payload=JSON.parse(statements.find(s=>s.sql.startsWith('INSERT INTO case_ai_jobs')).values[1]);return[];}};
 try{const reply=await store.resolveDialogue(event,prepared);assert.equal(reply.text,prepared.answer);assert.equal(payload.question,prepared.input);assert.deepEqual(payload.approvedCharacter,suspect.prompt);assert.equal(payload.personality,prepared.personality);assert.equal(payload.style,prepared.style);assert.match(payload.intent,/alibi/);assert.deepEqual(payload.recentConversation.map(t=>t.text),['Were you alone?','I was checking my work.']);assert.ok(!JSON.stringify(payload).includes('OTHER_PRIVATE_SECRET_SENTINEL'));assert.equal(payload.permittedAnswer,prepared.answer);assert.equal(payload.secret,undefined);assert.equal(payload.killerId,undefined);}finally{runtime.DB=oldDB;runtime.CASE_AI_PROVIDER='scripted';}
});
