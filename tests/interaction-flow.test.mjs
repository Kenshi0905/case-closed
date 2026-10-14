import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const source=await fs.readFile(new URL('../app/lib/interaction-flow.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createEvidenceInspector,createMovementQueue,enqueueMovement}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('inspection opens immediately while movement and authoritative discovery are pending',async()=>{
 const inspector=createEvidenceInspector(),movement=deferred(),server=deferred(),events=[];let discoveries=0;
 const task=inspector.inspect({open:()=>events.push('open'),status:s=>events.push(s),waitForMovement:()=>movement.promise,isCurrentSession:()=>true,discover:()=>{discoveries++;return server.promise;}});
 assert.deepEqual(events,['open','moving']);assert.equal(discoveries,0);
 movement.resolve();await tick();assert.deepEqual(events,['open','moving','inspecting']);assert.equal(discoveries,1);assert.ok(!events.includes('done'));
 server.resolve(true);await task;assert.equal(events.at(-1),'done');
});
test('closing during approach cancels the inspection before a clue request is sent',async()=>{
 const inspector=createEvidenceInspector(),movement=deferred(),events=[];let discoveries=0;
 const task=inspector.inspect({open:()=>events.push('open'),status:s=>events.push(s),waitForMovement:()=>movement.promise,isCurrentSession:()=>true,discover:async()=>{discoveries++;return true;}});
 inspector.cancel();movement.resolve();await task;assert.equal(discoveries,0);assert.deepEqual(events,['open','moving']);
});
test('late responses cannot reopen a closed object or replace a newer object inspection',async()=>{
 const inspector=createEvidenceInspector(),first=deferred(),second=deferred(),events=[];
 const a=inspector.inspect({open:()=>events.push('open watch'),status:s=>events.push('watch '+s),waitForMovement:async()=>{},isCurrentSession:()=>true,discover:()=>first.promise});await tick();
 inspector.cancel();const b=inspector.inspect({open:()=>events.push('open flask'),status:s=>events.push('flask '+s),waitForMovement:async()=>{},isCurrentSession:()=>true,discover:()=>second.promise});await tick();
 first.resolve(true);await a;assert.ok(!events.includes('watch done'));assert.equal(events.at(-1),'flask inspecting');
 second.resolve(true);await b;assert.equal(events.at(-1),'flask done');assert.equal(events.filter(e=>e.startsWith('open')).length,2);
});
test('failed validation never marks discovery complete, and changing sessions cancels queued inspection',async()=>{
 const inspector=createEvidenceInspector(),events=[];
 await inspector.inspect({open:()=>{},status:s=>events.push(s),waitForMovement:async()=>{},isCurrentSession:()=>true,discover:async()=>false});assert.deepEqual(events,['moving','inspecting','failed']);
 let requests=0;await inspector.inspect({open:()=>{},status:()=>{},waitForMovement:async()=>{},isCurrentSession:()=>false,discover:async()=>{requests++;return true;}});assert.equal(requests,0);
});
test('movement admits only two ordered steps at once instead of accumulating a long backlog',async()=>{
 const queue=createMovementQueue(),one=deferred(),two=deferred(),three=deferred(),sent=[],counts=[];let idle=0;
 const cb={pending:count=>counts.push(count),failed:()=>assert.fail('Unexpected movement failure'),idle:()=>idle++};
 assert.equal(enqueueMovement(queue,()=>{sent.push(1);return one.promise},cb),true);
 assert.equal(enqueueMovement(queue,()=>{sent.push(2);return two.promise},cb),true);
 for(let i=0;i<30;i++)assert.equal(enqueueMovement(queue,async()=>{sent.push('overflow');return true},cb),false);
 await tick();assert.deepEqual(sent,[1]);assert.equal(queue.pending,2);
 one.resolve(true);await tick();assert.deepEqual(sent,[1,2]);assert.equal(queue.pending,1);
 assert.equal(enqueueMovement(queue,()=>{sent.push(3);return three.promise},cb),true);two.resolve(true);await tick();assert.deepEqual(sent,[1,2,3]);three.resolve(true);await queue.tail;
 assert.equal(queue.pending,0);assert.equal(idle,1);assert.ok(counts.every(count=>count<=2));
});
test('a rejected movement drops dependent queued steps before accepting a corrected route',async()=>{
 const queue=createMovementQueue(),failed=deferred(),sent=[];let failures=0,idle=0;
 const cb={pending:()=>{},failed:()=>failures++,idle:()=>idle++};
 enqueueMovement(queue,()=>{sent.push('first');return failed.promise},cb);enqueueMovement(queue,async()=>{sent.push('invalid dependent tile');return true},cb);
 await tick();failed.resolve(false);await queue.tail;assert.deepEqual(sent,['first']);assert.equal(failures,1);assert.equal(queue.pending,0);assert.equal(idle,1);
 enqueueMovement(queue,async()=>{sent.push('corrected tile');return true},cb);await queue.tail;assert.deepEqual(sent,['first','corrected tile']);assert.equal(idle,2);
});
