import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

const source = await fs.readFile(new URL('../app/lib/audio.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
let moduleNumber = 0;
const freshAudio = () => import('data:text/javascript;base64,' + Buffer.from(javascript + `\n// instance ${++moduleNumber}`).toString('base64'));

function fakeBrowser(withAudio = false, saved = '1') {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const storage = new Map([['case-closed:sound-enabled', saved]]), events = new Map(), contexts = [];
  const parameter = () => ({ value: 0, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; }, cancelScheduledValues() {} });
  const node = () => ({ connect() {}, disconnect() {} });
  class FakeAudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 1; this.destination = {}; this.oscillators = []; contexts.push(this); }
    createGain() { return { ...node(), gain: parameter() }; }
    createBiquadFilter() { return { ...node(), frequency: parameter(), Q: parameter() }; }
    createOscillator() { const oscillator = { ...node(), frequency: parameter(), stops: 0, start() {}, stop() { this.stops++; } }; this.oscillators.push(oscillator); return oscillator; }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
  }
  globalThis.document = { hidden: false, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
  globalThis.window = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name), ...(withAudio ? { AudioContext: FakeAudioContext } : {}) };
  return { storage, events, contexts, restore() { if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow; if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument; } };
}

test('audio is safe during server rendering and preference subscribers unsubscribe', async () => {
  const audio = await freshAudio();
  assert.equal(audio.getSoundEnabled(), true);
  audio.playSfx('clue'); audio.playVoice(0, 0); await audio.unlockAudio();
  let updates = 0;
  const unsubscribe = audio.subscribeSound(() => updates++);
  audio.setSoundEnabled(false); assert.equal(audio.getSoundEnabled(), false); assert.equal(updates, 1);
  unsubscribe(); audio.toggleSound(); assert.equal(updates, 1);
  audio.disposeAudio();
});

test('saved mute works without Web Audio and enabling persists without throwing', async () => {
  const environment = fakeBrowser(false, '0');
  const audio = await freshAudio();
  try {
    assert.equal(audio.getSoundEnabled(), false);
    await audio.unlockAudio(); audio.playSfx('menu');
    assert.equal(audio.toggleSound(), true); await audio.unlockAudio();
    audio.playVoice(5, 10);
    assert.equal(environment.storage.get('case-closed:sound-enabled'), '1');
  } finally { audio.disposeAudio(); environment.restore(); }
});

test('no context exists before unlock; steps and voice bleeps are rate limited; mute stops notes', async () => {
  const environment = fakeBrowser(true);
  const audio = await freshAudio();
  try {
    audio.playSfx('step'); audio.playVoice(0, 1);
    assert.equal(environment.contexts.length, 0);
    await audio.unlockAudio();
    const context = environment.contexts[0];
    audio.playSfx('step'); audio.playSfx('step');
    assert.equal(context.oscillators.length, 1);
    audio.playVoice(3, 2); audio.playVoice(3, 3);
    assert.equal(context.oscillators.length, 2);
    audio.stopVoice();
    assert.equal(context.oscillators[0].stops, 1, 'Dialogue cleanup must preserve the step/menu sound channel');
    assert.equal(context.oscillators[1].stops, 2, 'Dialogue cleanup releases the active bleep');
    audio.setSoundEnabled(false);
    assert.ok(context.oscillators.every(oscillator => oscillator.stops >= 2));
    audio.playSfx('clue'); audio.playVoice(1, 8);
    assert.equal(context.oscillators.length, 2);
    assert.equal(environment.storage.get('case-closed:sound-enabled'), '0');
  } finally { audio.disposeAudio(); assert.equal(environment.contexts[0].state, 'closed'); assert.equal(environment.events.size, 0); environment.restore(); }
});

test('hidden tabs release scheduled notes, suspend the context, and remove listeners on disposal', async () => {
  const environment = fakeBrowser(true);
  const audio = await freshAudio();
  try {
    await audio.unlockAudio(); audio.playSfx('reveal');
    const context = environment.contexts[0];
    assert.equal(context.oscillators.length, 5);
    document.hidden = true; environment.events.get('visibilitychange')();
    audio.playSfx('menu'); assert.equal(context.oscillators.length, 5);
    await new Promise(resolve => setTimeout(resolve, 35));
    assert.equal(context.state, 'suspended');
    assert.ok(context.oscillators.every(oscillator => oscillator.stops >= 2));
    document.hidden = false; environment.events.get('visibilitychange')();
    await Promise.resolve(); assert.equal(context.state, 'running');
  } finally { audio.disposeAudio(); assert.equal(environment.events.size, 0); environment.restore(); }
});

test('the original shot is one modest layered cue, gesture gated, rate limited and muted', async () => {
  const environment = fakeBrowser(true), audio = await freshAudio();
  try {
    audio.playSfx('shot'); assert.equal(environment.contexts.length, 0);
    await audio.unlockAudio(); const context = environment.contexts[0];
    audio.playSfx('shot'); audio.playSfx('shot');
    assert.equal(context.oscillators.length, 2, 'one crack and one low report, without a repeated shot');
    audio.setSoundEnabled(false); audio.playSfx('shot');
    assert.equal(context.oscillators.length, 2);
    assert(context.oscillators.every(oscillator => oscillator.stops >= 2));
  } finally { audio.disposeAudio(); environment.restore(); }
});
