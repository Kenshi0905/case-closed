import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const source=await fs.readFile(new URL('../app/lib/participant-navigation.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {participantScreenChange}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const state=(phase,role='suspect',id='writer1',room='live',testSession=false)=>({state:{id:room,phase,testSession},viewer:{id,role}});
test('live and rehearsal writers enter the workspace when phase2 starts',()=>{
 for(const room of ['live','rehearsal1'])assert.equal(participantScreenChange(state(1,'suspect','writer1',room),state(2,'suspect','writer1',room),'investigation'),'suspects');
});
test('writers joining or restoring during phase2 immediately see their assignment',()=>{
 assert.equal(participantScreenChange(null,state(2),'investigation'),'suspects');assert.equal(participantScreenChange(state(2,'guest',null),state(2),'investigation'),'suspects');assert.equal(participantScreenChange(state(2),state(2,'suspect','writer2'),'investigation'),'suspects');
});
test('routine phase2 polls do not interrupt drafting or intentional navigation',()=>{
 for(const tab of ['suspects','investigation','evidence'])assert.equal(participantScreenChange(state(2),state(2),tab),null);
});
test('live and rehearsal writers leave the workspace when investigation begins',()=>{
 for(const room of ['live','rehearsal1'])assert.equal(participantScreenChange(state(2,'suspect','writer1',room),state(3,'suspect','writer1',room),'suspects'),'investigation');
});
test('detectives and hosts keep their current view while writers work',()=>{
 for(const role of ['detective','admin'])assert.equal(participantScreenChange(state(1,role),state(2,role),'investigation'),null);
 assert.equal(participantScreenChange(state(2),state(3),'evidence'),null);
});
test('the existing full participant test still moves into investigation at its deadline',()=>{
 assert.equal(participantScreenChange(state(2,'detective','test','test1',true),state(3,'detective','test','test1',true),'evidence'),'investigation');
});
