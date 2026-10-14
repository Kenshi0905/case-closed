import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

const base = new URL('../app/lib/', import.meta.url);
async function moduleURL(name, replacements = {}) {
  let source = (await fs.readFile(new URL(name, base), 'utf8')).replace("import 'server-only';", '');
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  return 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText).toString('base64');
}
const mapURL = await moduleURL('map-data.ts');
const caseURL = await moduleURL('case-data.ts');
const map = await import(mapURL);
const story = await import(caseURL);
const bankJSON=JSON.parse(await fs.readFile(new URL('story-bank.generated.json',base),'utf8'));
const bankJSONUrl='data:text/javascript;base64,'+Buffer.from('export default '+JSON.stringify(bankJSON)).toString('base64');
const curatedUrl=await moduleURL('story-bank-curated.ts');
const bankUrl=await moduleURL('story-bank.ts',{"'./story-bank.generated.json'":JSON.stringify(bankJSONUrl),"'./story-bank-curated'":JSON.stringify(curatedUrl)});
const openingUrl=await moduleURL('server/story.ts',{"'../story-bank'":JSON.stringify(bankUrl)});
const opening=await import(openingUrl);
const castUrl=await moduleURL('cast-profiles.ts');
const intentUrl=await moduleURL('server/semantic-intents.ts');
const styleJSON=JSON.parse(await fs.readFile(new URL('dialogue-style-bank.json',base),'utf8'));
const styleUrl='data:text/javascript;base64,'+Buffer.from('export default '+JSON.stringify(styleJSON)).toString('base64');
const dialogueUrl=await moduleURL('server/dialogue.ts',{"'../cast-profiles'":JSON.stringify(castUrl),"'./semantic-intents'":JSON.stringify(intentUrl),"'../dialogue-style-bank.json'":JSON.stringify(styleUrl)});
const limitsUrl=await moduleURL('workshop-limits.ts');
const facilitatorEmailUrl=await moduleURL('facilitator-emails.ts');
const engine = await import(await moduleURL('server/engine.ts', {
  "'../workshop-limits'":JSON.stringify(limitsUrl),"'../facilitator-emails'":JSON.stringify(facilitatorEmailUrl),
  "'../case-data'": JSON.stringify(caseURL), "'../map-data'": JSON.stringify(mapURL), "'./story'": JSON.stringify(openingUrl), "'./dialogue'":JSON.stringify(dialogueUrl),
}));
const steps = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
const key = ({ x, y }) => `${x},${y}`;
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
function reachableFrom(start, blocked = []) {
  const paths = new Map([[key(start), []]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (const delta of steps) {
      const next = { x: p.x + delta.x, y: p.y + delta.y };
      if (!map.canWalk(next.x, next.y) || paths.has(key(next)) || blocked.some(b => distance(b, next) === 0)) continue;
      paths.set(key(next), [...paths.get(key(p)), next]);
      queue.push(next);
    }
  }
  return { paths, cells: queue };
}
const demoRoster = story.CHARACTER_TEMPLATES.map((s, i) => ({ id: `custom-writer-${i + 31}`, name: s.characterName, x: s.x, y: s.y }));

test('map dimensions, integer coordinates, and outer walls are enforced', () => {
  assert.equal(map.COLLISION_GRID.length, map.MAP_HEIGHT);
  for (const row of map.COLLISION_GRID) assert.equal(row.length, map.MAP_WIDTH);
  for (let x = 0; x < map.MAP_WIDTH; x++) {
    assert.equal(map.canWalk(x, 0), false);
    assert.equal(map.canWalk(x, map.MAP_HEIGHT - 1), false);
  }
  for (let y = 0; y < map.MAP_HEIGHT; y++) {
    assert.equal(map.canWalk(0, y), false);
    assert.equal(map.canWalk(map.MAP_WIDTH - 1, y), false);
  }
  for (const p of [{ x: -1, y: 3 }, { x: 35, y: 3 }, { x: 16.5, y: 10 }, { x: NaN, y: 10 }, { x: 16, y: Infinity }]) {
    assert.equal(map.isValidPosition(p), false);
  }
  assert.equal(map.isValidPosition(map.DEFAULT_POSITION), true);
});

test('furniture blocks movement while all five room entrances remain connected', () => {
  for (const f of map.furniture) for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
    assert.equal(map.canWalk(x, y), false, `Furniture ${f.kind} must block ${x},${y}`);
  }
  const occupied = map.getMapTargets(demoRoster).filter(t => t.type !== 'evidence');
  const { cells, paths } = reachableFrom(map.DEFAULT_POSITION, occupied);
  for (const room of [{ x: 5, y: 8 }, { x: 16, y: 8 }, { x: 27, y: 8 }, { x: 6, y: 13 }, { x: 24, y: 13 }]) {
    assert.ok(paths.has(key(room)), `Room entrance ${key(room)} must be reachable`);
  }
  const totalWalkable = map.WALKABLE_GRID.flat().filter(Boolean).length - occupied.length;
  assert.equal(cells.length, totalWalkable, 'No walkable floor pocket may be stranded behind furniture or NPCs');
});

test('all clues, all six suspects, and the officer have a reachable adjacent interaction tile', () => {
  const targets = map.getMapTargets(demoRoster);
  assert.equal(targets.filter(t => t.type === 'evidence').length, 5);
  assert.equal(targets.filter(t => t.type === 'suspect').length, 6);
  assert.equal(targets.filter(t => t.type === 'officer').length, 1);
  const { cells } = reachableFrom(map.DEFAULT_POSITION, targets.filter(t => t.type !== 'evidence'));
  for (const target of targets) assert.ok(cells.some(p => distance(p, target) <= 1), `${target.label} must be reachable`);
});

test('client clue positions agree with the authoritative case and roster identity stays dynamic', () => {
  for (const clue of map.EVIDENCE_LOCATIONS) {
    const canonical = story.EVIDENCE_LOCATIONS.find(c => c.id === clue.id);
    assert.ok(canonical, `Unknown clue ${clue.id}`);
    assert.deepEqual({ x: clue.x, y: clue.y }, { x: canonical.x, y: canonical.y });
  }
  const reordered = [...demoRoster].reverse();
  const targets = map.getMapTargets(reordered).filter(t => t.type === 'suspect');
  assert.deepEqual(targets.map(t => t.id), reordered.map(s => s.id));
  for (let i = 0; i < targets.length; i++) {
    assert.equal(targets[i].label, reordered[i].name);
    assert.deepEqual({ x: targets[i].x, y: targets[i].y }, { x: reordered[i].x, y: reordered[i].y });
  }
});

test('a controller can follow real map routes and discover every clue through server mutations', () => {
  const event = engine.createDemo('map-walkthrough', 'map-player');
  const actor = engine.actorFor(event, 'map-player', null);
  const occupied = [...event.suspects, map.officerSpot];
  for (const clue of map.EVIDENCE_LOCATIONS) {
    const { cells, paths } = reachableFrom(event.avatar, occupied);
    const destination = cells.find(p => distance(p, clue) <= 1);
    assert.ok(destination, `${clue.id} needs an adjacent destination`);
    for (const p of paths.get(key(destination))) engine.mutate(event, actor, { type: 'move', ...p });
    engine.mutate(event, actor, { type: 'discover', evidenceId: clue.id });
  }
  assert.deepEqual([...event.evidenceIds].sort(), map.EVIDENCE_LOCATIONS.map(e => e.id).sort());
});

test('occupied NPC tiles remain blocked after suspect IDs change', () => {
  const event = engine.createDemo('map-occupancy', 'map-player');
  const actor = engine.actorFor(event, 'map-player', null);
  event.suspects.forEach((s, i) => { s.id = `fresh-participant-${i * 19 + 3}`; });
  const occupied = [...event.suspects, map.officerSpot];
  const { cells } = reachableFrom(event.avatar, occupied);
  for (const npc of occupied) {
    const adjacent = cells.find(p => distance(p, npc) === 1);
    assert.ok(adjacent);
    event.avatar = { ...adjacent };
    assert.throws(() => engine.mutate(event, actor, { type: 'move', x: npc.x, y: npc.y }), /unoccupied floor tile/);
  }
});
