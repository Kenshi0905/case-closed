#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUTPUT = path.join(ROOT, 'app/lib/story-bank.generated.json');
const CACHE = path.join(ROOT, '.local-ai/story-bank-generation');
const SLOTS = ['threshold', 'preparation', 'interruption', 'trace', 'corridor', 'departure'];
const SLOT_CONTEXT = {
  threshold: 'Anonymous first-person view from a laboratory entrance. Focus on doorway, floor, glass partition, ceiling reflections.',
  preparation: 'Anonymous first-person view of an ordinary laboratory bench. Focus on glass curves, metal tray, worktop textures, reflected light.',
  interruption: 'Anonymous close view of a wall fixture or camera housing. Focus on its casing, bracket, border, surface, wall shadows. Describe no operation or change.',
  trace: 'Anonymous close view of paper, metal, or glass. Focus on material, edges, reflected light, and depth. State no evidence or consequential finding.',
  corridor: 'Anonymous first-person view along a laboratory corridor. Focus on floor pattern, doorframes, walls, light and perspective.',
  departure: 'Anonymous view back toward a laboratory doorway. Focus on foreground frame, distant surfaces, perspective and reflected light.',
};
const STYLES = ['shallow reflections', 'foreground versus distance', 'soft and hard edges', 'contrasting materials', 'light across a surface', 'geometric framing'];
const forbidden = /\b(?:Mira|Dev|Isha|Kabir|Tara|Neil|Arjun|Sen|KIIT|Aster|killer|culprit|murderer|victim|kill|killed|murder|death|dead|died|blood|poison|toxin|toxic|dose|weapon|knife|gun|syringe|wound|corpse|guilty|innocent|alibi|confess|confession|fingerprint|bloodstain|residue|evidence|alarm|timestamp|broken|missing|deleted|erased|disabled|tampered|swapped|smashed|locked|unlocked|footprints|stolen|secret|hidden|flee|escape|steal|stole|hide|plant|pour|mix|replace|remove|destroy|disable|sever|cut|break|shatter|erase|delete|records|logs|he|she|they|his|her|their|someone|anyone|person|figure|man|woman|colleague|scientist|researcher)\b/i;
const material = /\b(?:light|shadow|reflection|surface|frame|floor|wall|edge|outline|texture|glass|metal|tile|ceiling|room|bench|tray|paper|doorway|corridor|passage|panel|worktop|bracket|fixture|camera|housing|trim|doorframe|threshold|angle|view|seam|corner|foreground|background|partition|doorframes|surfaces|reflections|shadows|tiles|edges|textures|lights)\b/i;
const normalize = text => text.trim().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ');
const textKey = text => normalize(text).toLowerCase().replace(/[^a-z ]/g, '');

export function validateFragment(candidate, slot) {
  if (!SLOTS.includes(slot) || typeof candidate !== 'string') return { ok: false, reason: 'schema' };
  const text = normalize(candidate);
  const words = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
  if (words.length < 10 || words.length > 25 || text.length > 190) return { ok: false, reason: 'length' };
  if (/\d|https?:|[<>\[\]{}$`"“”]|\n/.test(text)) return { ok: false, reason: 'unresolved_placeholder_or_markup' };
  if (forbidden.test(text) || /\b(?:face|faces|eyes|hair|skin|portrait|hand|hands|finger|fingers|footsteps|echo|echoes|echoing|sound|sounds|hum|humming|whisper|whispers|voice|voices|music|vase|vases|window|windows|lamp|lamps|cabinet|cabinets|dust|stained)\b/i.test(text) || /\bone moves\b/i.test(text)) return { ok: false, reason: 'identity_or_consequential_fact' };
  if (!material.test(text)) return { ok: false, reason: 'not_atmospheric' };
  if (/[.!?]\s+\S/.test(text)) return { ok: false, reason: 'multiple_sentences' };
  if (words.slice(1).some(word => /^[A-Z]/.test(word) && word !== 'I') || /\b[A-Z]{2,}\b/.test(text)) return { ok: false, reason: 'possible_name' };
  return { ok: true, text: /[.!?]$/.test(text) ? text : text + '.' };
}

function similar(text, entries) {
  const key = textKey(text), words = new Set(key.split(' '));
  return entries.some(entry => {
    if (textKey(entry.text) === key) return true;
    const other = new Set(textKey(entry.text).split(' '));
    const intersection = [...words].filter(word => other.has(word)).length;
    return intersection / (words.size + other.size - intersection) > .86;
  });
}

async function loadCurated() {
  const require = createRequire(import.meta.url), ts = require('typescript');
  const source = await fs.readFile(path.join(ROOT, 'app/lib/story-bank-curated.ts'), 'utf8');
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = path.join(CACHE, 'curated.cjs');
  await fs.writeFile(compiled, javascript);
  delete require.cache[compiled];
  return require(compiled).CURATED_STORY_BANK;
}
async function writeBank(entries) {
  const bank = { version: 1, canonical: { deathTime: '21:17', alarmTime: '21:19' }, entries };
  const temporary = OUTPUT + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(bank, null, 2) + '\n');
  await fs.rename(temporary, OUTPUT);
  return bank;
}
export function bankStatistics(entries) {
  const counts = Object.fromEntries(SLOTS.map(slot => [slot, entries.filter(entry => entry.slot === slot).length]));
  return { entries: entries.length, curated: entries.filter(entry => entry.source === 'curated').length,
    localGenerated: entries.filter(entry => entry.source === 'local-qwen').length, perSlot: counts,
    flavorCombinations: Object.values(counts).reduce((result, count) => result * BigInt(count), 1n).toString() };
}
export async function generateStoryBank({ batches = 24, perBatch = 4, url = 'http://127.0.0.1:8081/v1/chat/completions', model = 'case-closed-local', dryRun = false, onProgress = () => {} } = {}) {
  const endpoint = new URL(url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || !['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('Story generation is restricted to the local model on loopback.');
  if (!Number.isInteger(batches) || batches < 0 || batches > 120 || !Number.isInteger(perBatch) || perBatch < 1 || perBatch > 4) throw new Error('Choose zero to 120 small batches and one to four fragments per batch.');
  await fs.mkdir(CACHE, { recursive: true });
  const curated = await loadCurated();
  const entries = [];
  for (const entry of curated) {
    const result = validateFragment(entry.text, entry.slot);
    if (!result.ok) throw new Error(`Curated entry ${entry.id} failed validation: ${result.reason}`);
    entries.push({ ...entry, text: result.text });
  }
  let previous = {};
  try { previous = JSON.parse(await fs.readFile(OUTPUT, 'utf8')); } catch { /* Curated fallback is always available. */ }
  for (const entry of previous.entries || []) {
    if (entry.source !== 'local-qwen') continue;
    const result = validateFragment(entry.text, entry.slot);
    if (result.ok && !similar(result.text, entries)) entries.push({ ...entry, text: result.text });
  }
  await writeBank(entries);
  if (dryRun) return bankStatistics(entries);
  let completedBefore = 0;
  try { completedBefore = JSON.parse(await fs.readFile(path.join(CACHE, 'progress.json'), 'utf8')).completed || 0; } catch { /* First run. */ }
  let accepted = 0, rejected = 0, candidates = 0;
  for (let index = 0; index < batches; index++) {
    const batch = completedBefore + index, slot = SLOTS[batch % SLOTS.length], started = Date.now();
    const style = STYLES[Math.floor(batch / SLOTS.length) % STYLES.length];
    const prompt = `Write ${perBatch} different silent visual atmosphere fragments. Each is a complete sentence of 10 to 25 words, not a list or label. Begin with The or A. Example: The pale doorway frames a muted reflection along the edge of the laboratory floor. Example: A narrow band of light follows the metal rim beside the work surface. Context: ${SLOT_CONTEXT[slot]} Emphasis: ${style}. Only describe light, texture, surfaces and perspective. No names, other people, times, discoveries, explanations, events, clues or changes to objects. No narrator, hands, dialogue, faces, reflections of people, bodily details, sounds, footsteps, dust, stained glass, windows, or new props. No dramatic claims. Return only JSON {"fragments":[strings]}.`;
    let responseText = '', rawFragments = [], failure = '';
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(24_000), body: JSON.stringify({ model, messages: [{ role: 'system', content: 'You generate restrained, anonymous visual descriptions for a fictional laboratory scene. Scene facts come from a separate authoritative engine. You never invent consequential facts.' }, { role: 'user', content: prompt }], temperature: .82, top_p: .92, max_tokens: 230, stream: false, cache_prompt: true, seed: 2317 + batch * 73,
        response_format: { type: 'json_schema', json_schema: { name: 'story_fragments', strict: true, schema: { type: 'object', properties: { fragments: { type: 'array', items: { type: 'string' }, minItems: perBatch, maxItems: perBatch } }, required: ['fragments'], additionalProperties: false } } } }) });
      if (!response.ok) throw new Error(`local_http_${response.status}`);
      const result = await response.json(); responseText = result.choices?.[0]?.message?.content ?? '';
      const parsed = JSON.parse(responseText);
      if (!Array.isArray(parsed.fragments)) throw new Error('invalid_schema');
      rawFragments = parsed.fragments.slice(0, perBatch);
    } catch (error) { failure = error?.name === 'TimeoutError' ? 'timeout' : 'local_generation_failed'; }
    const outcomes = [];
    for (const raw of rawFragments) {
      candidates++;
      const result = validateFragment(raw, slot);
      if (!result.ok || similar(result.text, entries)) { rejected++; outcomes.push({ text: raw, accepted: false, reason: result.ok ? 'duplicate' : result.reason }); continue; }
      const id = 'local-' + slot + '-' + createHash('sha256').update(result.text).digest('hex').slice(0, 12);
      entries.push({ id, slot, kind: (batch + outcomes.length) % 2 ? 'object' : 'atmosphere', text: result.text, source: 'local-qwen' });
      accepted++; outcomes.push({ text: result.text, accepted: true });
    }
    await fs.appendFile(path.join(CACHE, 'raw-runs.ndjson'), JSON.stringify({ batch, slot, elapsedMs: Date.now() - started, failure, responseText, outcomes }) + '\n');
    await writeBank(entries);
    const progress = { completed: batch + 1, candidates, acceptedThisRun: accepted, rejectedThisRun: rejected, lastFailure: failure, ...bankStatistics(entries) };
    await fs.writeFile(path.join(CACHE, 'progress.json'), JSON.stringify(progress, null, 2));
    onProgress(progress);
  }
  return { candidates, acceptedThisRun: accepted, rejectedThisRun: rejected, ...bankStatistics(entries) };
}

async function main(args) {
  const options = { onProgress: progress => console.log(JSON.stringify(progress)) };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--batches') options.batches = Number(args[++i]);
    else if (args[i] === '--per-batch') options.perBatch = Number(args[++i]);
    else if (args[i] === '--url') options.url = args[++i];
    else if (args[i] === '--model') options.model = args[++i];
    else if (args[i] === '--dry-run') options.dryRun = true;
    else throw new Error('Options: --batches N --per-batch N --url LOOPBACK_URL --model LOCAL_ALIAS --dry-run');
  }
  console.log(JSON.stringify(await generateStoryBank(options)));
}
if (typeof process !== 'undefined' && process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
