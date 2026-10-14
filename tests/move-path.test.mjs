import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const app=path.resolve(fileURLToPath(new URL('../app/',import.meta.url)));
const runtime={CASE_AI_PROVIDER:'scripted',CASE_OWNER_EMAIL:'ashmitavash@gmail.com'};
globalThis.__movePathTestEnv=runtime;
const modules=new Map();
async function moduleURL(filename){
 filename=path.resolve(filename);if(modules.has(filename))return modules.get(filename);
 if(filename.endsWith('.json')){const value=JSON.parse(await fs.readFile(filename,'utf8'));const url='data:text/javascript;base64,'+Buffer.from('export default '+JSON.stringify(value)).toString('base64');modules.set(filename,url);return url;}
 let code=ts.transpileModule((await fs.readFile(filename,'utf8')).replace(/import ['"]server-only['"];?/g,''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const imports=[...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match=>match[1]);
 for(const specifier of imports){let url;
  if(specifier==='cloudflare:workers')url='data:text/javascript,export const env=globalThis.__movePathTestEnv';
  else if(specifier.startsWith('.')){let resolved=path.resolve(path.dirname(filename),specifier);if(!path.extname(resolved))resolved+='.ts';url=await moduleURL(resolved);}
  else continue;
  code=code.replaceAll("'"+specifier+"'",JSON.stringify(url)).replaceAll('"'+specifier+'"',JSON.stringify(url));
 }
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');modules.set(filename,url);return url;
}

const engine=await import(await moduleURL(path.join(app,'lib/server/engine.ts')));
const map=await import(await moduleURL(path.join(app,'lib/map-data.ts')));
const route=await import(await moduleURL(path.join(app,'api/action/route.ts')));
const steps=[{x:17,y:10},{x:18,y:10},{x:19,y:10},{x:20,y:10}];
function fixture(){const event=engine.createDemo('move-path-test','player');return{event,actor:engine.actorFor(event,'player',null)};}
function action(event,path=steps){return{type:'movePath',from:{...event.avatar},path};}
function rejectedWithoutMutation(event,actor,input,status=400){const before=JSON.stringify(event);assert.throws(()=>engine.mutate(event,actor,input),error=>error instanceof engine.AppError&&error.status===status);assert.equal(JSON.stringify(event),before);}
function approach(event,target){
 const occupied=[...event.suspects,map.officerSpot];const free=p=>map.canWalk(p.x,p.y)&&!occupied.some(o=>o.x===p.x&&o.y===p.y)&&!(p.x===target.x&&p.y===target.y);
 for(const[dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const first={x:target.x+dx,y:target.y+dy};if(!free(first))continue;for(const[sx,sy]of [[1,0],[-1,0],[0,1],[0,-1]]){const start={x:first.x+sx,y:first.y+sy};if(free(start))return{start,path:[first,target,first]};}}
 return null;
}

test('one batch validates every tile and saves only its final legal endpoint',()=>{
 const {event,actor}=fixture(),before=structuredClone(event);engine.mutate(event,actor,action(event));assert.deepEqual(event.avatar,steps.at(-1));before.avatar=steps.at(-1);assert.deepEqual(event,before);
 const max=Array.from({length:16},(_,i)=>({x:i%2?20:19,y:10}));engine.mutate(event,actor,action(event,max));assert.deepEqual(event.avatar,{x:20,y:10});
 engine.mutate(event,actor,{type:'move',x:21,y:10});assert.deepEqual(event.avatar,{x:21,y:10},'single-tile movement remains supported');
});

test('malformed, empty, oversized, noninteger and non-cardinal paths are rejected atomically',()=>{
 const {event,actor}=fixture();event.controllerId=null;const valid=action(event);
 const invalid=[{...valid,from:undefined},{...valid,from:null},{...valid,from:[16,10]},{...valid,from:{x:'16',y:10}},{...valid,from:{x:16.1,y:10}},{...valid,path:undefined},{...valid,path:null},{...valid,path:{}},{...valid,path:[]},{...valid,path:Array(17).fill({x:17,y:10})},...[[null],[[17,10]],[{x:17}],[{x:'17',y:10}],[{x:17.1,y:10}],[{x:Infinity,y:10}],[{x:NaN,y:10}],[{x:34,y:10}],[{x:-1,y:10}],[{x:16,y:21}],[{x:18,y:10}],[{x:17,y:11}],[{x:16,y:10}],[{x:17,y:10},{x:19,y:10}],[{x:17,y:10},{x:18,y:11}]].map(path=>({...valid,path}))];
 for(const input of invalid)rejectedWithoutMutation(event,actor,input);assert.equal(event.controllerId,null);
});

test('a stale explicit origin cannot be reinterpreted as a different valid path',()=>{
 const {event,actor}=fixture();rejectedWithoutMutation(event,actor,{type:'movePath',from:{x:15,y:10},path:[{x:16,y:10},{x:17,y:10}]},409);
 engine.mutate(event,actor,action(event));rejectedWithoutMutation(event,actor,{type:'movePath',from:{x:16,y:10},path:steps},409);
});

test('intermediate wall, furniture, officer and every suspect collision reject the entire path',()=>{
 const {event,actor}=fixture();event.controllerId=null;
 const furniture=map.furniture.flatMap(item=>Array.from({length:item.w},(_,x)=>Array.from({length:item.h},(_,y)=>({x:item.x+x,y:item.y+y})))).flat().find(target=>approach(event,target));assert.ok(furniture);
 const targets=[{x:15,y:9},furniture,map.officerSpot,...event.suspects];
 for(const target of targets){const route=approach(event,target);assert.ok(route,'Expected an adjacent legal approach');event.avatar=route.start;rejectedWithoutMutation(event,actor,action(event,route.path));}
});

test('path movement retains investigation phases and all controller authorization rules',()=>{
 const {event,actor}=fixture();for(const phase of [1,2,5,6]){event.phase=phase;event.controllerId=null;rejectedWithoutMutation(event,actor,action(event));}
 for(const phase of [3,4]){event.phase=phase;event.avatar={x:16,y:10};event.controllerId=null;engine.mutate(event,actor,action(event));assert.equal(event.controllerId,actor.id);}
 for(const role of ['guest','detective','suspect']){const f=fixture();f.event.mode='live';rejectedWithoutMutation(f.event,{id:'outsider',participantId:'outsider',name:'Other',role,isOwner:false},action(f.event),403);}
 const f=fixture();rejectedWithoutMutation(f.event,{...f.actor,id:'other-admin'},action(f.event),409);
 for(const role of ['detective','suspect']){const e=engine.createParticipantTest('private-'+role,'participant',role);e.phase=3;const player=engine.actorFor(e,'participant',null);engine.mutate(e,player,action(e));assert.deepEqual(e.avatar,steps.at(-1));rejectedWithoutMutation(e,{...player,id:'other',participantId:'other'},action(e,[{x:21,y:10}]),403);}
 const replay=engine.createDemo('move-replay','visitor','replay',fixture().event);engine.mutate(replay,engine.actorFor(replay,'visitor',null),action(replay));assert.deepEqual(replay.avatar,steps.at(-1));
});

function databaseFixture({stale=false}={}){
 const {event}=fixture();let row={state_json:JSON.stringify(event),revision:7},updates=0;
 runtime.DB={prepare(sql){return{bind(...values){return{
  async first(){if(sql.includes('case_sessions'))return{event_id:event.id,participant_id:'player'};if(sql.includes('FROM case_events'))return{...row};if(sql.includes('case_ai_status'))return null;throw Error('Unexpected query: '+sql);},
  async run(){if(sql.startsWith('INSERT OR IGNORE'))return{meta:{changes:0}};if(sql.startsWith('UPDATE case_events')){updates++;assert.equal(values[2],event.id);assert.equal(values[3],7);if(stale)return{meta:{changes:0}};row={state_json:values[0],revision:row.revision+1};return{meta:{changes:1}};}throw Error('Unexpected write: '+sql);}
 };}};}};
 return{event,get row(){return row},get updates(){return updates},request(input){return new Request('https://case.example.test/api/action',{method:'POST',headers:{origin:'https://case.example.test','content-type':'application/json',cookie:'cc_session='+('a'.repeat(64))},body:JSON.stringify(input)});}};
}

test('HTTP movePath performs one revision-checked save for the entire batch',async()=>{
 const f=databaseFixture();const response=await route.POST(f.request(action(f.event)));assert.equal(response.status,200);const data=await response.json();assert.deepEqual(data.state.avatar,steps.at(-1));assert.equal(data.state.revision,8);assert.equal(f.updates,1);assert.equal(f.row.revision,8);
});

test('HTTP movement rejection never partially persists and a CAS conflict never overwrites another action',async()=>{
 for(const input of [{type:'movePath',from:{x:16,y:10},path:[{x:17,y:10},{x:19,y:10}]},{type:'movePath',from:{x:16,y:10},path:[null]}]){const f=databaseFixture(),before=f.row.state_json;const response=await route.POST(f.request(input));assert.equal(response.status,400);assert.equal(f.updates,0);assert.equal(f.row.state_json,before);}
 const f=databaseFixture({stale:true}),before=f.row.state_json,response=await route.POST(f.request(action(f.event)));assert.equal(response.status,409);assert.equal(f.updates,1);assert.equal(f.row.state_json,before);assert.equal(f.row.revision,7);
});
