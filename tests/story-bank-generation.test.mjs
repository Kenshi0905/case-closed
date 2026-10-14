import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { bankStatistics, validateFragment } from '../scripts/generate-story-bank.mjs';

const bank = JSON.parse(await fs.readFile(new URL('../app/lib/story-bank.generated.json', import.meta.url), 'utf8'));
const slots = ['threshold', 'preparation', 'interruption', 'trace', 'corridor', 'departure'];

test('the deployable bank has six populated slots with honest, unique provenance', () => {
  assert.equal(bank.version, 1);
  assert.deepEqual(bank.canonical, { deathTime: '21:17', alarmTime: '21:19' });
  assert.ok(bank.entries.length >= 120);
  assert.equal(bank.entries.filter(entry => entry.source === 'curated').length, 120);
  assert.equal(new Set(bank.entries.map(entry => entry.id)).size, bank.entries.length);
  assert.equal(new Set(bank.entries.map(entry => entry.text.toLowerCase())).size, bank.entries.length);
  for (const slot of slots) assert.ok(bank.entries.filter(entry => entry.slot === slot).length >= 20);
  for (const entry of bank.entries) {
    assert.ok(['curated', 'local-qwen'].includes(entry.source));
    assert.ok(['atmosphere', 'object'].includes(entry.kind));
    if (entry.source === 'local-qwen') assert.equal(entry.id, `local-${entry.slot}-${createHash('sha256').update(entry.text).digest('hex').slice(0, 12)}`);
  }
});

test('every stored fragment passes identity, chronology, action and placeholder checks', () => {
  for (const entry of bank.entries) assert.equal(validateFragment(entry.text, entry.slot).ok, true, entry.id);
});

test('generation rejects new identities, times, consequential actions, markup and actors', () => {
  for (const text of [
    'Mira waits beside the laboratory bench while the overhead light shines onto the metal tray.',
    'The laboratory clock shows 21:05 above the surface of the nearest workbench.',
    'I remove the glass from the tray and hide it beneath the laboratory bench.',
    'The broken camera reveals a missing section of the security logs beside the wall.',
    'A pale reflection outlines {killerName} beside the frame of the laboratory entrance.',
    'A pale reflection outlines the <script> frame of the laboratory entrance beside the wall.',
    'Someone stands beside the bench while the light reaches the far side of the room.',
    'The ceiling above reflects my face, distorted in an unsettling mirror.',
    'My footsteps echo off the polished floor as I approach the narrow doorway.',
    'A narrow band of light highlights the edges of a fragile glass vase.',
    'The floor is slick and smooth underfoot, each step echoing on the hard surface.',
    'My hand traces the smooth metal rim of the camera housing.',
    'The distant laboratory surfaces are obscured by a thick layer of dust.',
  ]) assert.equal(validateFragment(text, 'threshold').ok, false, text);
  assert.equal(validateFragment('A soft band of light rests along the nearest edge of the worktop.', 'unknown-room').ok, false);
  assert.equal(validateFragment('A soft band of light rests along the nearest edge of the worktop.', 'preparation').ok, true);
});

test('combination counts reflect actual per-slot choices, not claimed unique mysteries', () => {
  const statistics = bankStatistics(bank.entries);
  const expected = slots.reduce((total, slot) => total * BigInt(bank.entries.filter(entry => entry.slot === slot).length), 1n);
  assert.equal(statistics.flavorCombinations, expected.toString());
  assert.equal(statistics.curated + statistics.localGenerated, bank.entries.length);
});

const bankModule = 'data:text/javascript;base64,' + Buffer.from('export const STORY_BANK=' + JSON.stringify(bank)).toString('base64');
const storySource = (await fs.readFile(new URL('../app/lib/server/story.ts', import.meta.url), 'utf8'))
  .replace("import 'server-only';", '').replace("'../story-bank'", JSON.stringify(bankModule));
const storyJavascript = ts.transpileModule(storySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const story = await import('data:text/javascript;base64,' + Buffer.from(storyJavascript).toString('base64'));

function narrativeCase(version = 3) {
  return {
    id: 'aftermath-check', createdAt: 1, phaseStartedAt: 1, phase: 3, title: 'Case Closed', narrativeSeed: 'aftermath-seed',
    opening: { ...story.initialOpening('aftermath-seed', version), choices: Object.fromEntries(story.OPENING_SCENES.map(scene => [scene.id, scene.choices[0].id])) },
    suspects: Array.from({ length: 6 }, (_, i) => ({ id: 'suspect-' + (i + 1), approved: true, prompt: {
      characterName: 'Writer ' + (i + 1), occupation: 'Researcher', relationship: 'Worked with Dr. Sen',
      publicAlibi: 'I was reviewing my work.', privateSecret: 'Private concern ' + (i + 1),
    } })),
    secret: { killerId: 'suspect-1', killerName: 'Writer 1', timeline: [
      { time: '21:14', event: 'The altered compound is handed to Dr. Sen.' },
      { time: '21:17', event: 'Dr. Sen collapses. His smartwatch strikes the desk and stops.' },
    ] },
  };
}

test('new aftermath actions have distinct consequences while fixing the shot at21:17 and concealing the narrator', () => {
  const scene = story.OPENING_SCENES.find(panel => panel.id === 'trace');
  const consequences = new Set();
  assert.deepEqual(scene.choices.map(choice => choice.id), ['detail', 'silence', 'doubt']);
  assert.ok(scene.choices.every(choice => !/^look\b/i.test(choice.label)));
  for (const choice of scene.choices) {
    const event = narrativeCase();
    const culpritId = event.secret.killerId;
    event.opening.choices.trace = choice.id;
    const brief = story.composeCaseStory(event);
    story.connectPrivateBackstories(event);
    consequences.add(event.secret.timeline.find(moment => moment.time === '21:18').event);
    assert.match(brief.summary, /After the collapse, the visitor/);
    assert.ok(!brief.summary.includes(event.secret.killerName));
    assert.equal(event.secret.killerId, culpritId);
    assert.match(event.secret.timeline.find(moment => moment.time === '21:17').event, /fires one shot/);
    assert.match(event.secret.timeline.find(moment => moment.time === '21:19').event, /alarm/);
    assert.ok(!event.secret.timeline.find(moment => moment.time === '21:14').event.includes('compound is handed'));
    assert.equal(story.openingSnapshot(event).scriptVersion, 3);
    assert.equal(story.openingSnapshot(event).panels.find(panel => panel.id === 'trace').caption, choice.outcome);
  }
  assert.equal(consequences.size, 3);
});

test('a stored legacy script keeps observation choices and never gains new aftermath actions', () => {
  const event = narrativeCase(2);
  const originalCollapse = structuredClone(event.secret.timeline.find(moment => moment.time === '21:17'));
  delete event.opening.script.consequenceActions;
  const trace = event.opening.script.panels.find(panel => panel.id === 'trace');
  trace.choices[0] = { id: 'detail', label: 'Look at the broken watch', outcome: 'I look at the broken watch. It reads 21:17.' };
  const before = structuredClone(event.opening.script);
  story.ensureFrozenOpening(event);
  const brief = story.composeCaseStory(event);
  story.connectPrivateBackstories(event);
  assert.deepEqual(event.opening.script, before);
  assert.equal(story.openingSnapshot(event).scriptVersion, 2);
  assert.deepEqual(event.secret.timeline.find(moment => moment.time === '21:17'), originalCollapse);
  assert.ok(event.secret.explanation.includes('altered compound'));
  assert.ok(!event.secret.explanation.includes('handgun'));
  assert.equal(story.openingSnapshot(event).panels.find(panel => panel.id === 'trace').caption, trace.choices[0].outcome);
  assert.ok(!brief.summary.includes('After the collapse, the visitor'));
  assert.ok(!event.secret.timeline.find(moment => moment.time === '21:18').event.includes('checks for a response'));
});

test('the reveal explains the evidence directly and attributes the authored personal concern', () => {
  const event = narrativeCase();
  event.opening.choices.interruption = 'work';
  event.opening.choices.trace = 'doubt';
  story.connectPrivateBackstories(event);
  assert.ok(event.secret.explanation.split(/\s+/).length <= 70);
  assert.ok(!event.secret.explanation.includes('?'));
  for (const fact of ['Writer 1', 'shot Dr. Sen', '21:12', '21:17', '21:19', 'flask', 'watch', 'backup ledger', 'corridor frames', 'handgun', 'meeting note']) {
    assert.ok(event.secret.explanation.includes(fact), fact);
  }
  assert.ok(!event.secret.explanation.includes('three minutes later'));
  assert.ok(event.secret.explanation.includes('does not explain the death'));
  const legacy = narrativeCase(2);
  story.connectPrivateBackstories(legacy);
  for (const fact of ['21:14', '21:17', '21:19', 'V-17', 'three minutes later', 'access ledger', 'corridor image']) assert.ok(legacy.secret.explanation.includes(fact), fact);
  assert.ok(event.secret.motive.includes('losing control of the research'));
  assert.ok(event.secret.motive.includes('Their own account describes a separate concern: “Private concern 1”'));
});
