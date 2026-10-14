import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const app=path.resolve(fileURLToPath(new URL('../app/',import.meta.url)));
const runtime={CASE_AI_PROVIDER:'scripted',CASE_OWNER_EMAIL:'ashmitavash@gmail.com'};
globalThis.__stateRetryTestEnv=runtime;
const modules=new Map();
async function moduleURL(filename){
 filename=path.resolve(filename);if(modules.has(filename))return modules.get(filename);
 if(filename.endsWith('.json')){const value=JSON.parse(await fs.readFile(filename,'utf8'));const url='data:text/javascript;base64,'+Buffer.from('export default '+JSON.stringify(value)).toString('base64');modules.set(filename,url);return url;}
 let code=ts.transpileModule((await fs.readFile(filename,'utf8')).replace(/import ['"]server-only['"];?/g,''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const imports=[...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match=>match[1]);
 for(const specifier of imports){let url;
  if(specifier==='cloudflare:workers')url='data:text/javascript,export const env=globalThis.__stateRetryTestEnv';
  else if(specifier.startsWith('.')){let resolved=path.resolve(path.dirname(filename),specifier);if(!path.extname(resolved))resolved+='.ts';url=await moduleURL(resolved);}
  else continue;
  code=code.replaceAll("'"+specifier+"'",JSON.stringify(url)).replaceAll('"'+specifier+'"',JSON.stringify(url));
 }
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');modules.set(filename,url);return url;
}

const engine=await import(await moduleURL(path.join(app,'lib/server/engine.ts')));
const retry=await import(await moduleURL(path.join(app,'lib/server/state-read-retry.ts')));
const route=await import(await moduleURL(path.join(app,'api/state/route.ts')));
const transient=()=>new Error('D1_ERROR: Network connection lost.');

test('only recognized D1 transport failures qualify, including nested causes',()=>{
 for(const error of [transient(),new Error('D1_ERROR: query failed',{cause:new Error('Network connection lost')}),Object.assign(new Error('Connection reset by peer'),{name:'D1Error'}),new Error('D1_ERROR: Network connection closed')])assert.equal(retry.isTransientStateReadError(error),true,error.message);
 for(const error of [new Error('Network connection lost'),new Error('D1_ERROR: no such table: case_events'),new Error('D1_ERROR: UNIQUE constraint failed'),new Error('D1_ERROR: database unavailable'),new Error('D1_ERROR: syntax error'),new Error('Could not parse saved case'),new engine.AppError('D1_ERROR: Network connection lost',403),new engine.AppError('Validation failed',400),new engine.AppError('Stale revision',409),new engine.AppError('Binding unavailable',503),'D1_ERROR: Network connection lost',null])assert.equal(retry.isTransientStateReadError(error),false,String(error));
 const cyclic=transient();cyclic.cause=cyclic;assert.equal(retry.isTransientStateReadError(cyclic),true);
});

test('state retries use exactly two short backoffs and preserve the final error',async()=>{
 const delays=[];let calls=0;const result=await retry.retryStateRead(async()=>{if(++calls<3)throw transient();return 'fresh state';},async ms=>{delays.push(ms);});
 assert.equal(result,'fresh state');assert.equal(calls,3);assert.deepEqual(delays,[120,280]);
 const final=transient();let failures=0;await assert.rejects(()=>retry.retryStateRead(async()=>{failures++;throw final;},async()=>{}),error=>error===final);assert.equal(failures,3);
 for(const error of [new engine.AppError('Forbidden',403),new engine.AppError('Another action changed the case',409),new Error('D1_ERROR: no such column')]){let attempts=0;await assert.rejects(()=>retry.retryStateRead(async()=>{attempts++;throw error;},async()=>{throw Error('No backoff expected');}),actual=>actual===error);assert.equal(attempts,1);}
});

function databaseFixture({event,session=null,failAfterCommit=false,failInitialize=false,relayFailures=0,readError=null}={}){
 const rows=new Map(event?[[event.id,{state_json:JSON.stringify(event),revision:0}]]:[]);
 const counts={initialize:0,inserted:0,loads:0,updates:0,statusReads:0};let commitFailure=failAfterCommit,initializeFailure=failInitialize;
 runtime.DB={prepare(sql){return{bind(...values){return{
  async first(){
   if(sql.includes('FROM case_sessions'))return session;
   if(sql.includes('FROM case_events')){counts.loads++;if(readError)throw readError;const row=rows.get(values[0]);return row?{...row}:null;}
   if(sql.includes('FROM case_ai_status')){counts.statusReads++;if(relayFailures-->0)throw transient();return null;}
   throw Error('Unexpected read: '+sql);
  },
  async run(){
   if(sql.startsWith('INSERT OR IGNORE INTO case_events')){counts.initialize++;if(!rows.has(values[0])){counts.inserted++;rows.set(values[0],{state_json:values[1],revision:0});}if(initializeFailure){initializeFailure=false;throw transient();}return{meta:{changes:counts.inserted?1:0}};}
   if(sql.startsWith('UPDATE case_events')){const row=rows.get(values[2]);if(!row||row.revision!==values[3])return{meta:{changes:0}};rows.set(values[2],{state_json:values[0],revision:row.revision+1});counts.updates++;if(commitFailure){commitFailure=false;throw transient();}return{meta:{changes:1}};}
   throw Error('Unexpected write: '+sql);
  }
 };}};}};
 const request=new Request('https://case.example.test/api/state',{headers:session?{cookie:'cc_session='+('a'.repeat(64))}:{}});
 return{rows,counts,request};
}

test('a late state-response disconnect restarts context and reloads fresh database state',async()=>{
 const event=engine.createEvent();event.aiMode='local';runtime.CASE_AI_PROVIDER='local';const f=databaseFixture({event,relayFailures:1});const response=await route.GET(f.request);assert.equal(response.status,200);const data=await response.json();assert.equal(data.state.phase,1);assert.equal(f.counts.initialize,0);assert.equal(f.counts.loads,2);assert.equal(f.counts.statusReads,2);assert.equal(f.counts.updates,0);assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');runtime.CASE_AI_PROVIDER='scripted';
});

test('retry after an uncertain initialization reuses the inserted live case',async()=>{
 const f=databaseFixture({failInitialize:true});const response=await route.GET(f.request);assert.equal(response.status,200);assert.equal(f.counts.initialize,1);assert.equal(f.counts.inserted,1);assert.equal(f.rows.size,1);assert.equal(f.rows.get('live').revision,0);
});

test('retry after a committed timed advancement does not approve or advance twice',async()=>{
 const event=engine.createParticipantTest('participant-test-retry','participant','detective');event.phase=2;event.phaseStartedAt=Date.now()-480001;event.promptDeadline=Date.now()-1;
 const f=databaseFixture({event,session:{event_id:event.id,participant_id:'participant'},failAfterCommit:true});const response=await route.GET(f.request);assert.equal(response.status,200);const data=await response.json();const saved=JSON.parse(f.rows.get(event.id).state_json);
 assert.equal(data.state.phase,3);assert.equal(data.state.revision,1);assert.equal(f.counts.updates,1);assert.equal(f.counts.loads,2);assert.equal(saved.submissions.length,6);assert.equal(new Set(saved.submissions.map(s=>s.suspectId)).size,6);assert.equal(saved.suspects.every(s=>s.approved),true);assert.equal(saved.dialogue.filter(d=>d.speaker==='Case file'&&d.text.includes('full six-minute')).length,1);assert.equal(saved.promptDeadline,null);
});

test('retry after committed owner initialization preserves the original facilitator seat',async()=>{
 const f=databaseFixture({event:engine.createEvent(),failAfterCommit:true});const request=new Request(f.request,{headers:{'oai-authenticated-user-id':'owner-provider','oai-authenticated-user-email':'ashmitavash@gmail.com','oai-authenticated-user-full-name':'Owner'}});const response=await route.GET(request);assert.equal(response.status,200);const data=await response.json(),saved=JSON.parse(f.rows.get('live').state_json);assert.equal(data.viewer.role,'admin');assert.equal(saved.ownerProviderId,'owner-provider');assert.equal(saved.facilitators.length,1);assert.equal(f.counts.updates,1);assert.equal(f.rows.get('live').revision,1);
});

test('GET preserves permission failures without retrying or changing their status',async()=>{
 const error=new engine.AppError('This workshop is restricted.',403),f=databaseFixture({event:engine.createEvent(),readError:error});const response=await route.GET(f.request);assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:error.message});assert.equal(f.counts.initialize,0);assert.equal(f.counts.loads,1);
});
