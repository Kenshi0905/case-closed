import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const source=await fs.readFile(new URL('../app/lib/case-data.ts',import.meta.url),'utf8');
const {getCaseAccessProfile}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
test('each clue leaves multiple suspects, while the three-clue intersection is unique in every five/six-person cast',()=>{
 for(let seed=0;seed<100;seed++)for(const count of [5,6]){
  const cast=Array.from({length:count},(_,slot)=>getCaseAccessProfile('case-'+seed,slot));
  assert.equal(new Set(cast.map(p=>JSON.stringify(p))).size,count);
  for(const culprit of cast){
   for(const key of ['clearance','badgeMark','docketGroup'])assert.ok(cast.filter(p=>p[key]===culprit[key]).length>=2,'One clue must not uniquely identify anyone');
   assert.equal(cast.filter(p=>Object.keys(culprit).every(key=>p[key]===culprit[key])).length,1);
  }
 }
});
test('public credentials stay stable across reads and vary across case seeds without needing the sealed culprit',()=>{
 const profile=getCaseAccessProfile('same-case',2);assert.deepEqual(profile,getCaseAccessProfile('same-case',2));
 const layouts=new Set(Array.from({length:20},(_,seed)=>JSON.stringify(Array.from({length:6},(_,slot)=>getCaseAccessProfile(String(seed),slot)))));
 assert.ok(layouts.size>1);
 assert.deepEqual(Object.keys(profile).sort(),['badgeMark','clearance','docketGroup']);
});
