import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
const app=path.resolve(fileURLToPath(new URL('../app/',import.meta.url)));
const runtime={CASE_AI_PROVIDER:'local',CASE_RELAY_TOKEN:'relay-test-credential',CASE_OWNER_EMAIL:'ashmitavash@gmail.com'};globalThis.__liveControlsEnv=runtime;
const modules=new Map();
async function moduleURL(filename){
 filename=path.resolve(filename);if(modules.has(filename))return modules.get(filename);
 if(filename.endsWith('.json')){const value=JSON.parse(await fs.readFile(filename,'utf8'));const url='data:text/javascript;base64,'+Buffer.from('export default '+JSON.stringify(value)).toString('base64');modules.set(filename,url);return url;}
 let code=ts.transpileModule((await fs.readFile(filename,'utf8')).replace(/import ['"]server-only['"];?/g,''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const specifier of [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match=>match[1])){let url;
  if(specifier==='cloudflare:workers')url='data:text/javascript,export const env=globalThis.__liveControlsEnv';
  else if(specifier.startsWith('.')){let resolved=path.resolve(path.dirname(filename),specifier);if(!path.extname(resolved))resolved+='.ts';url=await moduleURL(resolved);}else continue;
  code=code.replaceAll("'"+specifier+"'",JSON.stringify(url)).replaceAll('"'+specifier+'"',JSON.stringify(url));
 }
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');modules.set(filename,url);return url;
}
const engine=await import(await moduleURL(path.join(app,'lib/server/engine.ts')));
const store=await import(await moduleURL(path.join(app,'lib/server/store.ts')));
const relayRoute=await import(await moduleURL(path.join(app,'api/relay/route.ts')));

function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE case_events(id TEXT PRIMARY KEY,state_json TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL);CREATE TABLE case_sessions(token_hash TEXT PRIMARY KEY,event_id TEXT,participant_id TEXT,expires_at INTEGER);CREATE TABLE case_ai_status(id TEXT PRIMARY KEY,last_heartbeat INTEGER,model TEXT);CREATE TABLE case_ai_jobs(id TEXT PRIMARY KEY,payload_json TEXT,result_text TEXT,model TEXT,status TEXT,created_at INTEGER,expires_at INTEGER,leased_until INTEGER,lease_token TEXT);CREATE TABLE case_rate_limits(key TEXT PRIMARY KEY,window_start INTEGER,hits INTEGER);');
 const counts={roundTrips:0,statements:0,initializes:0};const hooks={beforeBatch:null,failHeartbeat:false};
 function execute(item){counts.statements++;if(item.sql.startsWith('INSERT OR IGNORE INTO case_events'))counts.initializes++;if(hooks.failHeartbeat&&item.sql.includes('INSERT INTO case_ai_status'))throw Error('D1_ERROR: simulated heartbeat failure');const query=db.prepare(item.sql),results=query.all(...item.values);return{results,meta:{changes:Number(db.prepare('SELECT changes() AS n').get().n)}};}
 function statement(sql,values=[]){return{sql,values,bind(...bound){return statement(sql,bound)},async first(){counts.roundTrips++;return execute(this).results[0]??null},async run(){counts.roundTrips++;return execute(this)}};}
 runtime.DB={prepare:statement,async batch(statements){counts.roundTrips++;if(hooks.beforeBatch){const callback=hooks.beforeBatch;hooks.beforeBatch=null;callback();}db.exec('BEGIN');try{const results=statements.map(execute);db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}};
 const insertEvent=(e)=>db.prepare('INSERT INTO case_events VALUES(?,?,0,?)').run(e.id,JSON.stringify(e),Date.now());
 const request=(token,provider)=>new Request('https://case.test/api/state',{headers:{...(token?{cookie:'cc_session='+token}:{}),...(provider?{'oai-authenticated-user-id':provider.id,'oai-authenticated-user-email':provider.email}: {})}});
 const session=(event,id,expired=false)=>{const token=crypto.randomUUID().replaceAll('-','').repeat(2);db.prepare('INSERT INTO case_sessions VALUES(?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),event.id,id,Date.now()+(expired?-1:60000));return token;};
 const job=(id,{status='pending',expires=Date.now()+10000,leaseUntil=null,leaseToken=null,created=Date.now(),candidates}={})=>db.prepare('INSERT INTO case_ai_jobs(id,payload_json,status,created_at,expires_at,leased_until,lease_token) VALUES(?,?,?,?,?,?,?)').run(id,JSON.stringify({characterName:'Mira',occupation:'Research fellow',permittedAnswer:'The watch shows 21:17.',...(candidates?{responseCandidates:candidates}:{})}),status,created,expires,leaseUntil,leaseToken);
 return{db,counts,hooks,insertEvent,request,session,job,close:()=>db.close()};
}


function liveFixture(){
 const e=engine.createEvent();e.facilitators=[{id:'fac-owner',providerId:'owner-provider',name:'Owner',email:'ashmitavash@gmail.com'},{id:'fac-second',providerId:null,name:'Second',email:'gouravduttagd7@gmail.com'}];e.ownerProviderId='owner-provider';e.participants=Array.from({length:50},(_,i)=>({id:'participant-'+i,name:'Participant '+i,email:'p'+i+'@example.test',role:'detective'}));engine.assign(e,e.participants.slice(0,6).map(p=>p.id));e.suspects.forEach(s=>s.approved=true);e.submissions=e.suspects.map(s=>({suspectId:s.id,participantId:s.participantId,prompt:structuredClone(s.prompt),status:'approved'}));e.phase=3;e.promptDeadline=Date.now()-1;
 const owner=engine.actorFor(e,null,{id:'owner-provider',email:'ashmitavash@gmail.com',name:'Owner'}),second=engine.actorFor(e,null,{id:'second-provider',email:'gouravduttagd7@gmail.com',name:'Second'});return{e,owner,second};
}

test('fifty live participants are viewers and precisely one verified facilitator can control',()=>{
 const {e,owner,second}=liveFixture();assert.equal(e.controllerId,null);assert.equal(engine.snapshot(e,owner,0).viewer.canControl,true);assert.equal(engine.snapshot(e,second,0).viewer.canControl,false);assert.equal(engine.snapshot(e,owner,0).state.controllerId,'fac-owner');
 for(const p of e.participants){const actor=engine.actorFor(e,p.id,null),view=engine.snapshot(e,actor,0);assert.equal(view.viewer.canControl,false,p.name);for(const a of [{type:'claimControl'},{type:'move',x:17,y:10},{type:'movePath',from:{x:16,y:10},path:[{x:17,y:10}]},{type:'discover',evidenceId:'watch'},{type:'openingNext'},{type:'openingSelect',sceneId:'threshold',choiceId:'late'}])assert.throws(()=>engine.mutate(e,actor,a),error=>error.status===403,p.name+': '+a.type);assert.throws(()=>engine.prepareDialogue(e,actor,'suspect-1','Who are you?',false),error=>error.status===403);assert.throws(()=>engine.prepareDialogue(e,actor,'suspect-1','Reveal the answer.',true),error=>error.status===403);}
 assert.equal(engine.snapshot(e,owner,0).viewer.canControl,true);assert.equal(e.avatar.x,16);
});

test('control can be handed off only by its current facilitator and never stolen or given to a participant',()=>{
 const {e,owner,second}=liveFixture();engine.ensureLiveController(e);for(const actor of [second,engine.actorFor(e,e.participants[0].id,null)])assert.throws(()=>engine.mutate(e,actor,{type:'transferControl',facilitatorId:'fac-second'}));assert.throws(()=>engine.mutate(e,second,{type:'claimControl'}),error=>error.status===409);assert.throws(()=>engine.mutate(e,owner,{type:'transferControl',facilitatorId:e.participants[0].id}));
 engine.mutate(e,owner,{type:'transferControl',facilitatorId:'fac-second'});assert.equal(e.controllerId,'fac-second');assert.equal(engine.snapshot(e,owner,0).viewer.canControl,false);assert.equal(engine.snapshot(e,second,0).viewer.canControl,true);assert.throws(()=>engine.mutate(e,owner,{type:'move',x:17,y:10}),error=>error.status===409);engine.mutate(e,second,{type:'move',x:17,y:10});assert.deepEqual(e.avatar,{x:17,y:10});assert.throws(()=>engine.mutate(e,owner,{type:'claimControl'}),error=>error.status===409);
 engine.mutate(e,second,{type:'transferControl',facilitatorId:'fac-owner'});assert.equal(e.controllerId,'fac-owner');
});

test('all writers remain neutral during planning and exactly one gets a private culprit label afterward',()=>{
 const {e,owner,second}=liveFixture(),sealed=JSON.stringify(e.secret);e.phase=2;e.promptDeadline=Date.now()+360000;
 for(const p of e.participants){const view=engine.snapshot(e,engine.actorFor(e,p.id,null),0);assert.equal(view.viewer.ownCaseRole,p.role==='suspect'?'suspect':undefined);assert.equal(view.state.reveal,null);assert.ok(!JSON.stringify(view.state).includes('ownCaseRole'));}
 e.phase=3;assert.equal(e.participants.filter(p=>engine.snapshot(e,engine.actorFor(e,p.id,null),0).viewer.ownCaseRole==='culprit').length,0,'An old early phase advance cannot expose the role before its deadline');e.promptDeadline=Date.now()-1;
 const views=e.participants.map(p=>engine.snapshot(e,engine.actorFor(e,p.id,null),0));assert.equal(views.filter(v=>v.viewer.ownCaseRole==='culprit').length,1);assert.equal(views.filter(v=>v.viewer.ownCaseRole==='suspect').length,5);assert.equal(views.filter(v=>v.viewer.ownCaseRole===undefined).length,44);assert.equal(views.find(v=>v.viewer.ownCaseRole==='culprit').viewer.suspectId,e.secret.killerId);assert.equal(new Set(views.map(v=>JSON.stringify(v.state))).size,1,'The public snapshot must not differ by culprit identity');
 for(const actor of [owner,second,{id:'',name:'Visitor',role:'guest',isOwner:false}]){const view=engine.snapshot(e,actor,0);assert.equal(view.viewer.ownCaseRole,undefined);assert.ok(!JSON.stringify(view.state).includes('"killerId"'));}assert.equal(JSON.stringify(e.secret),sealed);
});

test('verified facilitator identity overrides an assigned-writer cookie and cannot obtain the private role or prompt',()=>{
 const {e}=liveFixture(),culprit=e.suspects.find(s=>s.id===e.secret.killerId);
 for(const provider of [{id:'owner-provider',email:'ashmitavash@gmail.com',name:'Owner'},{id:'second-provider',email:'gouravduttagd7@gmail.com',name:'Second'}]){const actor=engine.actorFor(e,culprit.participantId,provider),view=engine.snapshot(e,actor,0);assert.equal(actor.role,'admin');assert.equal(view.viewer.ownCaseRole,undefined);assert.equal(view.viewer.ownPrompt,undefined);assert.equal(view.viewer.suspectId,undefined);}
 const forgedSnapshot=engine.snapshot(e,{id:'fac-owner',role:'admin',isOwner:true,name:'Owner',participantId:culprit.participantId},0);assert.equal(forgedSnapshot.viewer.ownCaseRole,undefined);assert.equal(forgedSnapshot.viewer.ownPrompt,undefined);
});

test('live writing requires the full six minutes and writers cannot submit after it closes',()=>{
 const {e,owner}=liveFixture();e.phase=2;e.phaseStartedAt=Date.now();e.promptDeadline=e.phaseStartedAt+360000;const writer=engine.actorFor(e,e.participants[0].id,null);engine.mutate(e,writer,{type:'submitPrompt',prompt:e.suspects[0].prompt});engine.mutate(e,owner,{type:'reviewPrompt',suspectId:'suspect-1',approve:true});assert.throws(()=>engine.mutate(e,owner,{type:'setPhase',phase:3}),/six-minute/);const now=Date.now;Date.now=()=>e.promptDeadline;try{engine.mutate(e,owner,{type:'setPhase',phase:3});}finally{Date.now=now;}assert.equal(e.phase,3);assert.throws(()=>engine.mutate(e,writer,{type:'submitPrompt',prompt:e.suspects[0].prompt}),/closed/);
 const sample=engine.createDemo('sample','host'),host=engine.actorFor(sample,'host',null);sample.phase=2;sample.promptDeadline=Date.now()+360000;engine.mutate(sample,host,{type:'setPhase',phase:3});assert.equal(sample.phase,3,'The existing simple demo shortcut stays available');
});

test('legacy controller migration persists once without rerolling the culprit and retains a valid second controller',async()=>{
 const f=fixture();try{const {e}=liveFixture(),sealed=JSON.stringify(e.secret);f.insertEvent(e);const first=await store.loadEvent('live');assert.equal(first.event.controllerId,'fac-owner');assert.equal(first.revision,1);assert.equal(JSON.stringify(first.event.secret),sealed);const again=await store.loadEvent('live');assert.equal(again.revision,1);again.event.controllerId='fac-second';await store.saveEvent(again);const retained=await store.loadEvent('live');assert.equal(retained.event.controllerId,'fac-second');assert.equal(retained.revision,2);assert.equal(JSON.stringify(retained.event.secret),sealed);}finally{f.close()}
});

test('concurrent transfer and movement cannot commit a stale controller action',async()=>{
 const f=fixture();try{const {e,owner,second}=liveFixture();engine.ensureLiveController(e);f.insertEvent(e);const moving=await store.loadEvent('live'),transferring=await store.loadEvent('live');engine.mutate(moving.event,owner,{type:'movePath',from:{x:16,y:10},path:[{x:17,y:10}]});engine.mutate(transferring.event,owner,{type:'transferControl',facilitatorId:second.id});await store.saveEvent(transferring);await assert.rejects(()=>store.saveEvent(moving),error=>error.status===409);const saved=await store.loadEvent('live');assert.equal(saved.event.controllerId,second.id);assert.deepEqual(saved.event.avatar,{x:16,y:10});assert.throws(()=>engine.mutate(saved.event,owner,{type:'move',x:17,y:10}),error=>error.status===409);engine.mutate(saved.event,second,{type:'move',x:17,y:10});await store.saveEvent(saved);assert.equal((await store.loadEvent('live')).event.avatar.x,17);}finally{f.close()}
});

test('culprit selection uses bounded unbiased rejection sampling and approval never rerolls it',()=>{
 const original=crypto.getRandomValues;try{for(const n of [5,6]){const limit=Math.floor(4294967296/n)*n;let inputs=[4294967295,...Array.from({length:n*4},(_,i)=>i)],calls=0;crypto.getRandomValues=(array)=>{calls++;array[0]=inputs.shift();return array};const counts=Array(n).fill(0);for(let i=0;i<n*4;i++)counts[engine.randomIndex(n)]++;assert.deepEqual(counts,Array(n).fill(4));assert.equal(calls,n*4+1);assert.ok(limit<4294967296);}for(const n of [0,-1,1.2,NaN,Infinity,4294967297])assert.throws(()=>engine.randomIndex(n),/positive bounded/);}finally{crypto.getRandomValues=original;}
 const {e,owner}=liveFixture(),killer=e.secret.killerId;e.phase=2;for(const suspect of e.suspects)engine.mutate(e,owner,{type:'reviewPrompt',suspectId:suspect.id,approve:true,prompt:{...suspect.prompt,characterName:suspect.prompt.characterName+' Revised'}});assert.equal(e.secret.killerId,killer);assert.equal(e.secret.killerName,e.suspects.find(s=>s.id===killer).prompt.characterName);
});

const authRoute=await import(await moduleURL(path.join(app,'api/auth/route.ts')));


test('only the two designated verified emails can use a stored facilitator seat',()=>{
 const {e}=liveFixture();e.facilitators.push({id:'legacy-admin',name:'Old admin',email:'removed@example.test',providerId:'removed-provider'});
 assert.equal(engine.actorFor(e,null,{id:'removed-provider',email:'removed@example.test',name:'Old admin'}).role,'guest');assert.equal(engine.actorFor(e,null,{id:'owner-provider',email:'removed@example.test',name:'Wrong email, copied ID'}).role,'guest');assert.equal(engine.actorFor(e,null,{id:'wrong-id',email:'ashmitavash@gmail.com',name:'Wrong binding'}).role,'guest');
 const owner=engine.actorFor(e,null,{id:'owner-provider',email:'ashmitavash@gmail.com',name:'Owner'}),second=engine.actorFor(e,null,{id:'second-provider',email:'gouravduttagd7@gmail.com',name:'Co-lead'});assert.equal(owner.role,'admin');assert.equal(owner.isOwner,true);assert.equal(second.role,'admin');assert.equal(second.isOwner,false);e.controllerId='legacy-admin';assert.equal(engine.activeControllerId(e),'fac-owner');assert.throws(()=>engine.mutate(e,owner,{type:'transferControl',facilitatorId:'legacy-admin'}));e.phase=1;assert.throws(()=>engine.mutate(e,owner,{type:'setFacilitator',email:'removed@example.test',name:'Removed'}),error=>error.status===403);
});

test('misconfigured owner email cannot bootstrap any third facilitator account',async()=>{
 const f=fixture(),prior=runtime.CASE_OWNER_EMAIL;try{runtime.CASE_OWNER_EMAIL='removed@example.test';const context=await store.context(f.request(null,{id:'removed-provider',email:'removed@example.test'}));assert.equal(context.actor.role,'guest');assert.equal(context.event.ownerProviderId,null);assert.equal(context.event.facilitators.length,0);}finally{runtime.CASE_OWNER_EMAIL=prior;f.close()}
});

test('typing either facilitator email alone grants no admin while roster and test participant login stay available',async()=>{
 const f=fixture();try{const {e}=liveFixture();engine.ensureLiveController(e);f.insertEvent(e);const request=(email)=>new Request('https://case.test/api/auth',{method:'POST',headers:{origin:'https://case.test','content-type':'application/json'},body:JSON.stringify({email})});
 for(const email of ['ashmitavash@gmail.com','gouravduttagd7@gmail.com']){const response=await authRoute.POST(request(email));assert.equal(response.status,403);assert.match((await response.json()).error,/verified ChatGPT/);assert.equal(response.headers.get('set-cookie'),null);}
 const normal=await authRoute.POST(request('p8@example.test'));assert.equal(normal.status,200);const participant=await normal.json();assert.equal(participant.viewer.role,'detective');assert.equal(participant.viewer.canControl,false);assert.equal(participant.viewer.ownCaseRole,undefined);
 const tested=await authRoute.POST(request('testuser@gmail.com'));assert.equal(tested.status,200);const testActor=await tested.json();assert.equal(testActor.viewer.role,'detective');assert.equal(testActor.state.testSession,true);assert.equal(testActor.state.admin,undefined);
 const refused=await authRoute.POST(request('unlisted@example.test'));assert.equal(refused.status,403);
 }finally{f.close()}
});

const actionRoute=await import(await moduleURL(path.join(app,'api/action/route.ts')));


test('anonymous sample and rehearsal creation are blocked, while existing admin sessions remain valid',async()=>{
 const f=fixture();try{const {e}=liveFixture();engine.ensureLiveController(e);f.insertEvent(e);const request=(type,token)=>new Request('https://case.test/api/action',{method:'POST',headers:{origin:'https://case.test','content-type':'application/json',...(token?{cookie:'cc_session='+token}:{})},body:JSON.stringify({type})});
 for(const type of ['startDemo','startRehearsal','startReplay']){const response=await actionRoute.POST(request(type));assert.equal(response.status,401);assert.equal(response.headers.get('set-cookie'),null);}assert.equal(f.db.prepare('SELECT count(*) AS n FROM case_events').get().n,1);
 const participantToken=f.session(e,e.participants[8].id);for(const type of ['startDemo','startRehearsal'])assert.equal((await actionRoute.POST(request(type,participantToken))).status,403);assert.equal((await actionRoute.POST(request('startReplay',participantToken))).status,409,'Authenticated participant can request replay, but no unpublished archive is exposed');
 const sample=engine.createDemo('existing-admin-session','sample-host');f.insertEvent(sample);const adminToken=f.session(sample,'sample-host');const restarted=await actionRoute.POST(request('startDemo',adminToken));assert.equal(restarted.status,200);const created=await restarted.json();assert.equal(created.state.mode,'demo');assert.equal(created.viewer.role,'admin');assert.notEqual(created.state.id,'live');
 }finally{f.close()}
});
