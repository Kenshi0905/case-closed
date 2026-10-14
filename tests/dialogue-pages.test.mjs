import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

const source = await fs.readFile(new URL('../app/components/InterrogationDialog.tsx', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('InterrogationDialog.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const paginator = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'paginateDialogue');
assert.ok(paginator, 'The dialogue paginator must exist');
const javascript = ts.transpileModule(paginator.getFullText(parsed), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { paginateDialogue } = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));

test('paging keeps every word and time in a long reply, in its original order', () => {
  const reply = ('Dr. Sen met the team at 21:12. The watch stopped at 21:17, before the alarm at 21:19. ' +
    'An account is a claim to compare with the evidence, and every detail still needs to remain available. ').repeat(4);
  for (const length of [160, 260]) {
    const pages = paginateDialogue(reply, length);
    assert.ok(pages.length > 1);
    assert.ok(pages.every(page => page.length <= length));
    assert.equal(pages.join(' '), reply.trim().replace(/\s+/g, ' '));
  }
});

test('short and empty replies remain a single page without invented text', () => {
  assert.deepEqual(paginateDialogue('The watch stopped at 21:17.'), ['The watch stopped at 21:17.']);
  assert.deepEqual(paginateDialogue(''), ['']);
  const longWord = 'x'.repeat(300);
  assert.equal(paginateDialogue(longWord).join(' '), longWord);
});

test('mobile pages do not strand the next sentence after a complete camera answer', () => {
  const first = 'The camera feed went dark at 21:16 and returned at 21:19, so the corridor was unrecorded for exactly three minutes.';
  const second = 'I was in the server room checking the backup logs, and the access record can confirm that.';
  const reply = first + ' ' + second + ' Ask Tara whether anyone else passed that door.';
  const pages = paginateDialogue(reply, 160);
  assert.equal(pages[0], first);
  assert.ok(pages[1].startsWith('I was in the server room'));
  assert.ok(pages.every(page => page.length <= 160));
  assert.equal(pages.join(' '), reply);
});

test('honorifics and quoted times stay with their complete sentence when it fits', () => {
  const first = 'I checked the locked laboratory entrance and compared the late arrivals against the access record before anyone was allowed back inside.';
  const second = 'Dr. Sen was still working at 21:12. “The watch stopped at 21:17.”';
  const pages = paginateDialogue(first + ' ' + second, 160);
  assert.equal(pages[0], first);
  assert.equal(pages[1], second);
  assert.ok(pages.every(page => !page.endsWith('Dr.')));
});

test('an oversized sentence wraps by words and preserves every detail at both viewport sizes', () => {
  const longSentence = 'I checked the access log at 21:12 and then walked through the corridor to compare the laboratory records with the server backup before the watch stopped at 21:17 and the alarm sounded at 21:19, because the two systems were reporting separate events and neither record could explain the missing camera footage by itself.';
  const ending = 'That is why you must compare the evidence.';
  for (const length of [160, 260]) {
    const pages = paginateDialogue(longSentence + ' ' + ending, length);
    assert.ok(pages.length > 1);
    assert.ok(pages.every(page => page.length <= length));
    assert.equal(pages.join(' '), longSentence + ' ' + ending);
    assert.ok(pages.at(-1).endsWith(ending));
  }
});

test('short neighboring sentences share a page without unnecessary paging', () => {
  const reply = 'The watch stopped at 21:17. The alarm sounded at 21:19.';
  assert.deepEqual(paginateDialogue(reply, 160), [reply]);
});
