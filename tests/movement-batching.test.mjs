import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const source=await fs.readFile(new URL('../app/lib/interaction-flow.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createMovementPathQueue,enqueueMovementPath,cancelMovementPath,reconcileMovementPosition,MOVEMENT_BUFFER_LIMIT,MOVEMENT_BATCH_LIMIT}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const point=x=>({x,y:0});

for(const latency of [600,1000])test('continuous140ms walking stays smooth with '+latency+'ms network latency',async()=>{
 const queue=createMovementPathQueue(),delivered=[],batchSizes=[];let now=0,active=null,requests=0,maxPending=0,confirmed=point(0),predicted=point(0);
 const callbacks={pending:count=>{maxPending=Math.max(maxPending,count)},failed:()=>assert.fail('Unexpected rejection'),idle:()=>{predicted=reconcileMovementPosition(predicted,confirmed,queue.pending)}};
 const send=movement=>{assert.equal(active,null,'Only one movement request may be in flight');assert.deepEqual(movement.from,confirmed);assert.ok(movement.path.length<=MOVEMENT_BATCH_LIMIT);requests++;batchSizes.push(movement.path.length);const wait=deferred();active={...wait,movement,due:now+latency};return wait.promise};
 const complete=async()=>{const request=active;active=null;confirmed=request.movement.path.at(-1);delivered.push(...request.movement.path);request.resolve(true);await tick()};
 for(let step=1;step<=120;step++){
  now=(step-1)*140;
  if(active&&now>=active.due)await complete();
  const next=point(step);assert.equal(enqueueMovementPath(queue,next,confirmed,send,callbacks),true,'Local stepping must not wait for each RTT');predicted=next;
  assert.strictEqual(reconcileMovementPosition(predicted,confirmed,queue.pending),predicted,'Poll must retain predicted position while a batch is unconfirmed');
 }
 while(active){now=active.due;await complete()}
 await queue.tail;
 assert.deepEqual(delivered,Array.from({length:120},(_,i)=>point(i+1)));assert.deepEqual(predicted,point(120));assert.equal(queue.pending,0);assert.ok(maxPending<MOVEMENT_BUFFER_LIMIT);assert.ok(requests<35,'Requests must be coalesced, not one per tile');assert.ok(batchSizes.some(size=>size>1));
});

test('one stable drain waits for every buffered batch before inspecting or switching sessions',async()=>{
 const queue=createMovementPathQueue(),requests=[],events=[];
 const send=movement=>{const wait=deferred();requests.push({...movement,...wait});return wait.promise};
 const cb={pending:()=>{},failed:()=>assert.fail('Unexpected failure'),idle:()=>events.push('idle')};
 for(let i=1;i<=28;i++)assert.equal(enqueueMovementPath(queue,point(i),point(0),send,cb),true);
 const drain=queue.tail;let settled=false;const after=drain.then(()=>{settled=true;events.push('inspect/session change')});
 assert.equal(requests.length,1);assert.equal(requests[0].path.length,1);
 requests[0].resolve(true);await tick();assert.equal(settled,false);assert.strictEqual(queue.tail,drain);assert.equal(requests[1].path.length,16);assert.deepEqual(requests[1].from,point(1));
 requests[1].resolve(true);await tick();assert.equal(settled,false);assert.equal(requests[2].path.length,11);assert.deepEqual(requests[2].from,point(17));
 requests[2].resolve(true);await after;assert.deepEqual(events,['idle','inspect/session change']);assert.equal(queue.pending,0);
});

test('an outage has a hard32-tile bound without losing the next route step',async()=>{
 const queue=createMovementPathQueue(),requests=[];
 const send=movement=>{const wait=deferred();requests.push({...movement,...wait});return wait.promise};
 const cb={pending:()=>{},failed:()=>assert.fail('Unexpected failure'),idle:()=>{}};
 for(let i=1;i<=MOVEMENT_BUFFER_LIMIT;i++)assert.equal(enqueueMovementPath(queue,point(i),point(0),send,cb),true);
 assert.equal(enqueueMovementPath(queue,point(33),point(0),send,cb),false);assert.equal(queue.pending,32);assert.equal(requests.length,1);
 requests[0].resolve(true);await tick();assert.equal(enqueueMovementPath(queue,point(33),point(1),send,cb),true);
 requests[1].resolve(true);await tick();requests[2].resolve(true);await queue.tail;
 assert.deepEqual(requests.flatMap(request=>request.path),Array.from({length:33},(_,i)=>point(i+1)));
});

test('a rejected batch drops every dependent step and never retries the path',async()=>{
 const queue=createMovementPathQueue(),first=deferred(),sent=[];let failed=0,idle=0;
 const cb={pending:()=>{},failed:()=>failed++,idle:()=>idle++};
 for(let i=1;i<=12;i++)enqueueMovementPath(queue,point(i),point(0),movement=>{sent.push(movement);return first.promise},cb);
 first.resolve(false);await queue.tail;
 assert.equal(sent.length,1);assert.equal(queue.pending,0);assert.equal(failed,1);assert.equal(idle,1);
 enqueueMovementPath(queue,point(1),point(0),async movement=>{sent.push(movement);return true},cb);await queue.tail;assert.equal(sent.length,2);assert.deepEqual(sent[1],{from:point(0),path:[point(1)]});
});

test('session replacement cancels unsent steps, waits for the old write, then starts at the new origin',async()=>{
 const queue=createMovementPathQueue(),old=deferred(),sent=[],counts=[];
 const cb={pending:count=>counts.push(count),failed:()=>assert.fail('Explicit cancellation is not a rejection'),idle:()=>{}};
 for(let i=1;i<=10;i++)enqueueMovementPath(queue,point(i),point(0),movement=>{sent.push(movement);return old.promise},cb);
 const oldDrain=queue.tail;cancelMovementPath(queue);assert.equal(queue.pending,1);assert.equal(enqueueMovementPath(queue,point(90),point(89),async()=>true,cb),false);
 old.resolve(true);await oldDrain;assert.equal(sent.length,1);assert.equal(queue.pending,0);
 assert.equal(enqueueMovementPath(queue,point(91),point(90),async movement=>{sent.push(movement);return true},cb),true);await queue.tail;
 assert.deepEqual(sent[1],{from:point(90),path:[point(91)]});assert.ok(counts.every(count=>count>=0));
});

test('poll acknowledgements preserve prediction until drain, then adopt the confirmed correction',()=>{
 const predicted={x:15,y:8},confirmed={x:10,y:8};
 assert.strictEqual(reconcileMovementPosition(predicted,confirmed,7),predicted);
 assert.deepEqual(reconcileMovementPosition(predicted,confirmed,0),confirmed);
 assert.notStrictEqual(reconcileMovementPosition(predicted,confirmed,0),confirmed);
});
