import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
// Local HTTP smoke test: a new anonymous case only. Never mutate a hosted workshop.
const base=new URL(process.env.CASE_TEST_URL||'http://127.0.0.1:5173');
assert.ok(['127.0.0.1','localhost','[::1]'].includes(base.hostname));
const source=await fs.readFile(new URL('../app/lib/map-data.ts',import.meta.url),'utf8');
const map=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
let cookie='',latest;const replies=[];
async function action(input,expected=200){
 const response=await fetch(new URL('/api/action',base),{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(input)});
 const set=response.headers.getSetCookie().find(v=>v.startsWith('cc_session='));if(set)cookie=set.split(';')[0];
 const result=await response.json();assert.equal(response.status,expected,JSON.stringify({input,error:result.error}));if(response.ok)latest=result;return result;
}
const before=await(await fetch(new URL('/api/state',base))).json();
await action({type:'startSolo'});assert.equal(latest.viewer.role,'detective');assert.equal(latest.state.soloPlay,true);assert.equal(latest.state.engine,'scripted');assert.equal(latest.state.admin,undefined);
await action({type:'setAiMode',mode:'local'},403);
for(const [i,panel] of latest.state.opening.panels.entries()){await action({type:'openingSelect',sceneId:panel.id,choiceId:panel.choices[i%panel.choices.length].id});await action({type:'openingNext'});}
await action({type:'beginSoloInvestigation'});assert.equal(latest.state.phase,3);assert.equal(latest.state.promptDeadline,null);
function pathTo(target){const queue=[{p:latest.state.avatar,path:[]}],seen=new Set();for(const {p,path} of queue){if(Math.abs(p.x-target.x)+Math.abs(p.y-target.y)<=1)return path;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const n={x:p.x+dx,y:p.y+dy},key=n.x+','+n.y;if(seen.has(key)||!map.canWalk(n.x,n.y)||[...latest.state.suspects,map.officerSpot].some(b=>b.x===n.x&&b.y===n.y))continue;seen.add(key);queue.push({p:n,path:[...path,n]});}}throw Error('No route');}
for(const clue of latest.state.evidence){const path=pathTo(clue);while(path.length)await action({type:'movePath',from:latest.state.avatar,path:path.splice(0,16)});await action({type:'discover',evidenceId:clue.id});}
for(const suspect of latest.state.suspects){for(const message of ['Who are you?','Where were you?','Did you see the smartwatch break?','Tell me your secret.']){await action({type:'interrogate',suspectId:suspect.id,message});const text=latest.state.dialogue.filter(d=>d.kind==='answer').at(-1).text;assert.ok(text.length>10);replies.push({suspect:suspect.name,question:message,reply:text});}}
const saved=await(await fetch(new URL('/api/state',base),{headers:{cookie}})).json();assert.equal(saved.state.id,latest.state.id);assert.equal(saved.state.evidence.filter(e=>e.discovered).length,5);
await action({type:'beginAccusation'});await action({type:'vote',suspectId:latest.state.suspects[2].id});await action({type:'finishCase'});assert.equal(latest.state.phase,6);assert.ok(latest.state.reveal);
const after=await(await fetch(new URL('/api/state',base))).json();assert.equal(after.state.id,before.state.id);assert.equal(after.state.revision,before.state.revision);
console.log(JSON.stringify({passed:true,clues:5,suspects:6,replies,phase:latest.state.phase,liveUnchanged:true},null,2));
