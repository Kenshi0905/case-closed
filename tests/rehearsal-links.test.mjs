import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const source=await fs.readFile(new URL('../app/lib/rehearsal-links.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {readRehearsalInvitation,rehearsalSeatLink,withoutRehearsalInvitation}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('seat link carries one fixed invitation and survives URL encoding',()=>{
 const url=new URL(rehearsalSeatLink('https://case.test','rehearsal/a b','secret+token=&'));
 assert.equal(url.origin,'https://case.test');assert.equal(url.pathname,'/');assert.deepEqual([...url.searchParams.keys()],['rehearsal','invite']);assert.deepEqual(readRehearsalInvitation(url),{roomId:'rehearsal/a b',token:'secret+token=&'});
});
test('incomplete invitation URLs never attempt participant entry',()=>{
 for(const query of ['', '?rehearsal=room','?invite=token','?rehearsal=room&invite='])assert.equal(readRehearsalInvitation(new URL('https://case.test/'+query)),null);
});
test('successful entry removes the invitation secret while preserving unrelated location state',()=>{
 const url=new URL('https://case.test/?rehearsal=room&invite=secret&other=keep#notes');
 assert.equal(withoutRehearsalInvitation(url),'/?other=keep#notes');assert.equal(url.searchParams.get('invite'),'secret');
});
