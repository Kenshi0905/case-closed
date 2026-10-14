import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const source = await fs.readFile(new URL('../app/lib/facilitator-access.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const {resolveFacilitatorReturn} = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));

test('successful callback opens controls only for a server-confirmed live administrator', () => {
 assert.equal(resolveFacilitatorReturn('ready','live','admin'),'ready');
 for(const mode of ['demo','replay']) assert.equal(resolveFacilitatorReturn('ready',mode,'admin'),'error');
 for(const role of ['guest','suspect','detective']) assert.equal(resolveFacilitatorReturn('ready','live',role),'error');
});
test('denial and callback errors remain explicit without treating a private sample as authorized', () => {
 assert.equal(resolveFacilitatorReturn('denied','demo','admin'),'denied');
 assert.equal(resolveFacilitatorReturn('error','live','guest'),'error');
});
test('normal visits and unknown URL markers do not change the active view', () => {
 for(const marker of [null,'','true','READY','admin']) assert.equal(resolveFacilitatorReturn(marker,'live','admin'),null);
});
