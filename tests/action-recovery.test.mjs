import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
async function moduleAt(file){const source=await fs.readFile(new URL(file,import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
const {requestJson,createActionRecovery,RequestTimeoutError,RequestRejectedError,RecoveryRequiredError}=await moduleAt('../app/lib/action-recovery.ts');
const {createMovementQueue,enqueueMovement,createEvidenceInspector}=await moduleAt('../app/lib/interaction-flow.ts');
function deferred(){let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail});return{promise,resolve,reject};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const response=(value,status=200)=>({ok:status>=200&&status<300,status,json:async()=>value});

test('the deadline covers a hung fetch and a stalled response body, and aborts both',async()=>{
 for(const bodyHangs of [false,true]){
  let signal;const never=new Promise(()=>{});
  await assert.rejects(requestJson('/api/action',{method:'POST'},12,async(_url,init)=>{signal=init.signal;return bodyHangs?{ok:true,status:200,json:()=>never}:never}),RequestTimeoutError);
  assert.equal(signal.aborted,true);
 }
});

test('a hung discover releases busy, performs one read, and blocks duplicates without replaying the write',async()=>{
 const read=deferred(),post=deferred(),events=[];let busy=true,writes=0;
 const guard=createActionRecovery({read:()=>{events.push('read');return read.promise},blocked:()=>{busy=false;events.push('blocked')},recovered:state=>events.push(state),failed:()=>assert.fail('Unexpected read failure')});
 const discover=guard.write(()=>requestJson('/api/action',{method:'POST'},12,async()=>{writes++;return post.promise}));
 await assert.rejects(discover,RequestTimeoutError);assert.equal(busy,false);assert.equal(guard.blocked,true);
 await assert.rejects(guard.write(async()=>{writes++;return 'duplicate'}),RecoveryRequiredError);assert.equal(writes,1);
 const reconnect=guard.synchronize();assert.strictEqual(guard.synchronize(),reconnect);
 post.resolve(response({clue:'late response'}));await tick();assert.equal(guard.blocked,true);assert.ok(!events.includes('late response'));
 read.resolve('confirmed discovered clue');assert.equal(await reconnect,true);assert.equal(guard.blocked,false);assert.deepEqual(events,['blocked','read','confirmed discovered clue']);
});

test('failed and timed-out resyncs keep writes blocked until a later Reconnect read succeeds',async()=>{
 let reads=0,writes=0;const snapshots=[],errors=[];
 const guard=createActionRecovery({read:()=>{reads++;return requestJson('/api/state',{},12,async()=>reads===1?new Promise(()=>{}):reads===2?Promise.reject(new TypeError('offline')):response({revision:9}))},blocked:()=>{},recovered:value=>snapshots.push(value),failed:error=>errors.push(error)});
 await assert.rejects(guard.write(async()=>{writes++;throw new TypeError('connection lost')}));
 assert.equal(await guard.synchronize(),false);assert.equal(guard.blocked,true);assert.ok(errors[0] instanceof RequestTimeoutError);
 assert.equal(await guard.synchronize(),false);assert.equal(guard.blocked,true);
 await assert.rejects(guard.write(async()=>{writes++;}),RecoveryRequiredError);assert.equal(writes,1);
 assert.equal(await guard.synchronize(),true);assert.equal(guard.blocked,false);assert.deepEqual(snapshots,[{revision:9}]);
 await guard.write(async()=>{writes++;return 'new intentional action'});assert.equal(writes,2);
});

test('a hung movement drains the queue, cancels dependent tiles and a waiting inspection',async()=>{
 const queue=createMovementQueue(),inspector=createEvidenceInspector(),read=deferred(),sent=[],statuses=[];let busy=true,idle=0;
 const guard=createActionRecovery({read:()=>read.promise,blocked:()=>{busy=false;queue.generation++;inspector.cancel()},recovered:()=>{},failed:()=>assert.fail('Unexpected read failure')});
 const callbacks={pending:()=>{},failed:()=>{},idle:()=>idle++};
 enqueueMovement(queue,async()=>{sent.push('first tile');try{await guard.write(()=>requestJson('/api/action',{method:'POST'},12,()=>new Promise(()=>{})));return true}catch{return false}},callbacks);
 enqueueMovement(queue,async()=>{sent.push('dependent tile');return true},callbacks);
 const inspect=inspector.inspect({open:()=>{},status:status=>statuses.push(status),waitForMovement:()=>queue.tail,isCurrentSession:()=>true,discover:async()=>{sent.push('discover');return true}});
 await queue.tail;await inspect;
 assert.equal(busy,false);assert.equal(queue.pending,0);assert.equal(idle,1);assert.deepEqual(sent,['first tile']);assert.deepEqual(statuses,['moving']);assert.equal(guard.blocked,true);
 read.resolve({avatar:{x:16,y:10}});await guard.synchronize();
 enqueueMovement(queue,async()=>{sent.push('corrected route');return true},callbacks);await queue.tail;assert.equal(sent.at(-1),'corrected route');
});

test('actions waiting for movement are cancelled even if resync finishes before their queue drains',async()=>{
 const movement=deferred();let sent=0;
 const guard=createActionRecovery({read:async()=>({revision:2}),blocked:()=>{},recovered:()=>{},failed:()=>assert.fail('Unexpected failure')});
 const waiting=guard.write(async()=>{sent++;return 'must not send'},()=>movement.promise);
 await assert.rejects(guard.write(async()=>{throw new TypeError('lost movement response')}));await guard.synchronize();assert.equal(guard.blocked,false);
 movement.resolve();await assert.rejects(waiting,RecoveryRequiredError);assert.equal(sent,0);
});

test('successful discovery stays ordered and returns the confirmed result without a recovery read',async()=>{
 const movement=deferred(),events=[];let reads=0;
 const guard=createActionRecovery({read:async()=>{reads++;return{}},blocked:()=>assert.fail('Unexpected block'),recovered:()=>{},failed:()=>assert.fail('Unexpected failure')});
 const task=guard.write(()=>requestJson('/api/action',{method:'POST'},50,async()=>{events.push('discover');return response({discovered:true})}),()=>movement.promise);
 await tick();assert.deepEqual(events,[]);movement.resolve();assert.deepEqual(await task,{discovered:true});assert.equal(reads,0);assert.equal(guard.blocked,false);
});

test('confirmed validation denials do not resync, but an uncertain server failure does',async()=>{
 let reads=0;
 const guard=createActionRecovery({read:async()=>{reads++;return{}},blocked:()=>{},recovered:()=>{},failed:()=>assert.fail('Unexpected read failure')});
 await assert.rejects(guard.write(()=>requestJson('/api/action',{method:'POST'},50,async()=>response({error:'Walk closer'},403))),error=>error instanceof RequestRejectedError&&error.message==='Walk closer');
 assert.equal(reads,0);assert.equal(guard.blocked,false);
 await assert.rejects(guard.write(()=>requestJson('/api/action',{method:'POST'},50,async()=>response({error:'Server response unavailable'},503))),RequestRejectedError);
 await guard.synchronize();assert.equal(reads,1);
});

test('stale movement rejection forces read reconciliation and never repeats its path',async()=>{
 const read=deferred();let writes=0;const snapshots=[];
 const guard=createActionRecovery({read:()=>read.promise,blocked:()=>{},recovered:state=>snapshots.push(state),failed:()=>assert.fail('Unexpected failure')});
 await assert.rejects(guard.write(async()=>{writes++;throw new RequestRejectedError('Stale route origin',409)},undefined,true),RequestRejectedError);
 assert.equal(guard.blocked,true);await assert.rejects(guard.write(async()=>{writes++}),RecoveryRequiredError);
 read.resolve({avatar:{x:16,y:10}});await guard.synchronize();assert.equal(writes,1);assert.equal(guard.blocked,false);assert.deepEqual(snapshots,[{avatar:{x:16,y:10}}]);
});
