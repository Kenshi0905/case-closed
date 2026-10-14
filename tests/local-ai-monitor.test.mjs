import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRelayMonitor} from '../scripts/local-ai-monitor.mjs';
import {runRelay} from '../scripts/local-ai-relay.mjs';
const job={id:'PRIVATE_JOB_ID',leaseToken:'PRIVATE_LEASE',characterName:'Mira',occupation:'Research fellow',question:'What is your name?',permittedAnswer:'I am Mira.',approvedCharacter:{privateSecret:'PRIVATE_AUTHOR_SECRET'},solution:'SEALED_SOLUTION'};

test('the loopback monitor projects only question, character, status and timings',async()=>{
 const writes=[];let clock=1000;const monitor=createRelayMonitor({now:()=>clock,write:async(_name,value)=>writes.push(value)});monitor.begin(job);monitor.stage('generating',{modelLatencyMs:Infinity,leaseToken:'PRIVATE_LEASE'});clock+=75;monitor.stage('delivering',{source:'local',modelLatencyMs:74.6});clock+=40;monitor.finish('delivered',{deliveryLatencyMs:40.1});await monitor.flush();
 const state=monitor.snapshot();assert.equal(state.active,null);assert.equal(state.recent[0].question,job.question);assert.equal(state.recent[0].suspect,'Mira');assert.equal(state.recent[0].modelLatencyMs,75);assert.equal(state.recent[0].deliveryLatencyMs,40);assert.equal(state.recent[0].stage,'delivered');const serialized=JSON.stringify(writes);for(const secret of ['PRIVATE_JOB_ID','PRIVATE_LEASE','PRIVATE_AUTHOR_SECRET','SEALED_SOLUTION','I am Mira.'])assert.ok(!serialized.includes(secret));
 assert.deepEqual(Object.keys(state.recent[0]).sort(),['deliveryLatencyMs','finishedAt','modelLatencyMs','question','sequence','source','stage','startedAt','suspect']);
});

test('monitor history is bounded, heartbeat writes are throttled, and interruption is truthful',async()=>{
 let clock=0,writes=0;const monitor=createRelayMonitor({now:()=>clock,write:async()=>{writes++}});monitor.heartbeat('connected');for(let n=0;n<10;n++){clock+=100;monitor.heartbeat('connected');}await monitor.flush();assert.equal(writes,1);
 for(let n=0;n<15;n++){monitor.begin({...job,question:'Question '+n});monitor.finish('delivered');}assert.equal(monitor.snapshot().recent.length,12);assert.equal(monitor.snapshot().recent[0].question,'Question 3');monitor.begin(job);monitor.stop();await monitor.flush();assert.equal(monitor.snapshot().recent.length,12);assert.equal(monitor.snapshot().recent.at(-1).stage,'interrupted');assert.equal(monitor.snapshot().relay,'stopped');
});

test('monitor storage failures never interrupt the relay and repeated atomic writes replace the status file',async()=>{
 const failed=createRelayMonitor({write:async()=>{throw Error('disk unavailable')}});failed.begin(job);failed.finish('fallback');await assert.doesNotReject(()=>failed.flush());
 const workspaceTmp=fileURLToPath(new URL('../.sites-runtime/',import.meta.url));await fs.mkdir(workspaceTmp,{recursive:true});const directory=await fs.mkdtemp(path.join(workspaceTmp,'monitor-test-')),filename=path.join(directory,'status.json');const monitor=createRelayMonitor({filename});try{monitor.begin(job);await monitor.flush();assert.equal(JSON.parse(await fs.readFile(filename,'utf8')).active.question,job.question);monitor.finish('delivered');await monitor.flush();assert.equal(JSON.parse(await fs.readFile(filename,'utf8')).recent[0].stage,'delivered');}finally{await fs.rm(filename,{force:true});await fs.rm(filename+'.tmp',{force:true});await fs.rmdir(directory);}
});

test('the real relay lifecycle reports delivery and expiry without exposing its protected job fields',async()=>{
 const originalFetch=globalThis.fetch,originalLog=console.log;console.log=()=>{};const config={siteUrl:'https://workshop.example.test',relayToken:'SECRET_RELAY',localUrl:'http://127.0.0.1:8081/v1/chat/completions',model:'fixture-model'};
 try{for(const expires of [false,true]){const monitor=createRelayMonitor({write:async()=>{}});globalThis.fetch=async(url,options)=>{if(String(url)===config.localUrl)return Response.json({choices:[{message:{content:'{"choice":0}'}}]});const body=options.body?JSON.parse(options.body):null;if(body?.heartbeat)return Response.json({ok:true});if(body?.jobId)return Response.json(expires?{error:'Expired'}:{accepted:true},{status:expires?409:200});return Response.json({job,pollAfterMs:200});};await runRelay(config,{once:true,monitor});const state=monitor.snapshot();assert.equal(state.recent.length,1);assert.equal(state.recent[0].stage,expires?'expired':'delivered');assert.ok(Number.isFinite(state.recent[0].modelLatencyMs));assert.ok(!JSON.stringify(state).includes(config.relayToken));assert.equal(state.relay,'stopped');}}
 finally{globalThis.fetch=originalFetch;console.log=originalLog;}
});
