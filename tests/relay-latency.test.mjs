import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
const app=path.resolve(fileURLToPath(new URL('../app/',import.meta.url)));
const runtime={CASE_AI_PROVIDER:'local',CASE_RELAY_TOKEN:'relay-test-credential',CASE_OWNER_EMAIL:'ashmitavash@gmail.com'};globalThis.__relayLatencyEnv=runtime;
const modules=new Map();
async function moduleURL(filename){
 filename=path.resolve(filename);if(modules.has(filename))return modules.get(filename);
 if(filename.endsWith('.json')){const value=JSON.parse(await fs.readFile(filename,'utf8'));const url='data:text/javascript;base64,'+Buffer.from('export default '+JSON.stringify(value)).toString('base64');modules.set(filename,url);return url;}
 let code=ts.transpileModule((await fs.readFile(filename,'utf8')).replace(/import ['"]server-only['"];?/g,''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const specifier of [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match=>match[1])){let url;
  if(specifier==='cloudflare:workers')url='data:text/javascript,export const env=globalThis.__relayLatencyEnv';
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
 db.exec('CREATE TABLE case_events(id TEXT PRIMARY KEY,state_json TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL);CREATE TABLE case_sessions(token_hash TEXT PRIMARY KEY,event_id TEXT,participant_id TEXT,expires_at INTEGER);CREATE TABLE case_ai_status(id TEXT PRIMARY KEY,last_heartbeat INTEGER,model TEXT);CREATE TABLE case_ai_jobs(id TEXT PRIMARY KEY,payload_json TEXT,result_text TEXT,model TEXT,status TEXT,created_at INTEGER,expires_at INTEGER,leased_until INTEGER,lease_token TEXT);');
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

test('existing event context is read-only, still checks each session, and cannot retain expired identity',async()=>{
 const f=fixture();try{const live=engine.createEvent(),demo=engine.createDemo('demo-existing','host');f.insertEvent(live);f.insertEvent(demo);const token=f.session(demo,'host');
 let data=await store.context(f.request(token));assert.equal(data.actor.role,'admin');assert.equal(data.event.id,demo.id);assert.equal(f.counts.roundTrips,2);assert.equal(f.counts.initializes,0);
 f.db.prepare('UPDATE case_sessions SET expires_at = ?').run(Date.now()-1);data=await store.context(f.request(token));assert.equal(data.actor.role,'guest');assert.equal(data.event.id,'live');assert.equal(f.counts.roundTrips,4);assert.equal(f.counts.initializes,0);
 const forced=await store.context(f.request(),{live:true});assert.equal(forced.event.id,'live');assert.equal(f.counts.roundTrips,5);
 }finally{f.close()}
});

test('concurrent first visits initialize one live event and bind only the verified configured owner',async()=>{
 const f=fixture();try{const visits=await Promise.all(Array.from({length:8},()=>store.context(f.request())));assert.ok(visits.every(v=>v.event.id==='live'&&v.actor.role==='guest'));assert.equal(f.db.prepare('SELECT count(*) AS n FROM case_events').get().n,1);assert.equal(new Set(visits.map(v=>v.event.createdAt)).size,1);
 const strangers=await store.context(f.request(null,{id:'stranger',email:'stranger@example.test'}));assert.equal(strangers.actor.role,'guest');const owners=await Promise.all(Array.from({length:3},()=>store.context(f.request(null,{id:'owner',email:'ashmitavash@gmail.com'}))));assert.ok(owners.every(v=>v.actor.isOwner));const row=f.db.prepare('SELECT * FROM case_events').get();assert.equal(row.revision,1);assert.equal(JSON.parse(row.state_json).facilitators.length,1);
 }finally{f.close()}
});

test('missing requested event falls back to existing live without using its old participant identity',async()=>{
 const f=fixture();try{f.insertEvent(engine.createEvent());const token=f.session({id:'deleted-demo'},'old-host');const state=await store.context(f.request(token));assert.equal(state.event.id,'live');assert.equal(state.actor.role,'guest');assert.equal(f.counts.roundTrips,3);assert.equal(f.counts.initializes,0);}finally{f.close()}
});

test('claim combines heartbeat and exclusive leasing in one round trip, including empty polls',async()=>{
 const f=fixture();try{await store.heartbeat('known-model');f.counts.roundTrips=0;f.counts.statements=0;f.job('one');const results=await Promise.all(Array.from({length:4},()=>store.claimJob()));assert.equal(results.filter(Boolean).length,1);assert.equal(f.counts.roundTrips,4);assert.equal(f.counts.statements,8);assert.equal(f.db.prepare('SELECT model FROM case_ai_status').get().model,'known-model');assert.equal(f.db.prepare('SELECT status FROM case_ai_jobs').get().status,'leased');const claimed=results.find(Boolean);assert.equal(claimed.id,'one');assert.equal(claimed.leaseToken,f.db.prepare('SELECT lease_token FROM case_ai_jobs').get().lease_token);
 }finally{f.close()}
});

test('claim ignores expired jobs and only reclaims elapsed leases without granting the old token access',async()=>{
 const f=fixture();try{f.job('expired',{expires:Date.now()-1,created:0});f.job('occupied',{status:'leased',leaseUntil:Date.now()+20000,leaseToken:'still-valid',created:1});f.job('reclaim',{status:'leased',leaseUntil:Date.now()-1,leaseToken:'old-token',created:2});const next=await store.claimJob();assert.equal(next.id,'reclaim');assert.notEqual(next.leaseToken,'old-token');await assert.rejects(()=>store.completeJob({jobId:'reclaim',leaseToken:'old-token',text:'The watch shows 21:17.'}),e=>e.status===409);assert.equal(await store.claimJob(),null);
 }finally{f.close()}
});

test('completion validates candidates, batches result and heartbeat, and acknowledges one concurrent winner only',async()=>{
 const f=fixture();try{const candidates=['The watch shows 21:17.','I read 21:17 on the watch.'];f.job('one',{candidates});const claim=await store.claimJob();f.counts.roundTrips=0;f.counts.statements=0;const input={jobId:'one',leaseToken:claim.leaseToken,text:candidates[1],model:'local-fixture'};
 const results=await Promise.allSettled([store.completeJob(input),store.completeJob(input)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.status,409);assert.equal(f.counts.roundTrips,4);assert.equal(f.counts.statements,6);const row=f.db.prepare('SELECT * FROM case_ai_jobs').get();assert.equal(row.status,'complete');assert.equal(row.result_text,candidates[1]);assert.equal(f.db.prepare('SELECT model FROM case_ai_status').get().model,'local-fixture');
 f.job('rogue',{candidates});const rogue=await store.claimJob();const declined=await store.completeJob({jobId:'rogue',leaseToken:rogue.leaseToken,text:'I saw the killer.',model:'local-fixture'});assert.deepEqual(declined,{ok:true,accepted:false});assert.equal(f.db.prepare("SELECT result_text FROM case_ai_jobs WHERE id='rogue'").get().result_text,null);
 }finally{f.close()}
});

test('database-time expiry, lease expiry and token replacement during completion never acknowledge success',async()=>{
 for(const scenario of ['job-expiry','lease-expiry','token-replaced']){const f=fixture();try{f.job('race');const claim=await store.claimJob();f.hooks.beforeBatch=()=>{if(scenario==='job-expiry')f.db.prepare("UPDATE case_ai_jobs SET expires_at = ? WHERE id='race'").run(Date.now()-1);else if(scenario==='lease-expiry')f.db.prepare("UPDATE case_ai_jobs SET leased_until = ? WHERE id='race'").run(Date.now()-1);else f.db.prepare("UPDATE case_ai_jobs SET lease_token = 'other' WHERE id='race'").run();};await assert.rejects(()=>store.completeJob({jobId:'race',leaseToken:claim.leaseToken,text:'The watch shows 21:17.'}),e=>e.status===409);assert.equal(f.db.prepare("SELECT status FROM case_ai_jobs WHERE id='race'").get().status,'leased');}finally{f.close()}}
});

test('batch failure rolls back the result and does not claim completion',async()=>{
 const f=fixture();try{f.job('rollback');const claim=await store.claimJob();f.hooks.failHeartbeat=true;await assert.rejects(()=>store.completeJob({jobId:'rollback',leaseToken:claim.leaseToken,text:'The watch shows 21:17.'}),/heartbeat failure/);const row=f.db.prepare('SELECT status,result_text FROM case_ai_jobs').get();assert.equal(row.status,'leased');assert.equal(row.result_text,null);}finally{f.close()}
});

test('relay GET authenticates before its single claim batch',async()=>{
 const f=fixture();try{const denied=await relayRoute.GET(new Request('https://case.test/api/relay'));assert.equal(denied.status,401);assert.equal(f.counts.roundTrips,0);const accepted=await relayRoute.GET(new Request('https://case.test/api/relay',{headers:{authorization:'Bearer relay-test-credential'}}));assert.equal(accepted.status,200);assert.deepEqual(await accepted.json(),{job:null,pollAfterMs:1000});assert.equal(f.counts.roundTrips,1);}finally{f.close()}
});


test('database clock rejects expired claims and completions even when the worker clock is behind',async()=>{
 const f=fixture(),realNow=Date.now,wallTime=Date.now();try{
 f.job('clock-expired',{expires:wallTime-100});Date.now=()=>wallTime-1000;assert.equal(await store.claimJob(),null);assert.equal(f.db.prepare("SELECT status FROM case_ai_jobs WHERE id='clock-expired'").get().status,'pending');
 f.job('clock-complete',{status:'leased',expires:wallTime-100,leaseUntil:wallTime+10000,leaseToken:'current'});await assert.rejects(()=>store.completeJob({jobId:'clock-complete',leaseToken:'current',text:'The watch shows 21:17.'}),error=>error.status===409);assert.equal(f.db.prepare("SELECT status FROM case_ai_jobs WHERE id='clock-complete'").get().status,'leased');
 }finally{Date.now=realNow;f.close()}
});
