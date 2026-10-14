import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

const source = await fs.readFile(new URL('../app/lib/map-motion.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { MAP_STEP_MS, interpolateMapStep, nextMapStepStart, followMapCamera, remoteMapRoute } = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
const mapSource = await fs.readFile(new URL('../app/lib/map-data.ts', import.meta.url), 'utf8');
const mapCode = ts.transpileModule(mapSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const map = await import('data:text/javascript;base64,' + Buffer.from(mapCode).toString('base64'));

test('one shared tile duration reaches the exact center without overshoot', () => {
  const from = { x: 8, y: 7 }, to = { x: 9, y: 7 };
  assert.equal(MAP_STEP_MS, 140);
  assert.deepEqual(interpolateMapStep(from, to, -10), from);
  assert.deepEqual(interpolateMapStep(from, to, MAP_STEP_MS / 2), { x: 8.5, y: 7 });
  assert.deepEqual(interpolateMapStep(from, to, MAP_STEP_MS), to);
  assert.deepEqual(interpolateMapStep(from, to, 1000), to);
});

test('held movement remains continuous through tile boundaries at different frame rates', () => {
  for (const fps of [24, 30, 60, 120, 144]) {
    let started = 0, from = { x: 0, y: 7 }, to = { x: 1, y: 7 }, previousTime = 0;
    for (let frame = 1; frame <= fps; frame++) {
      const time = frame * 1000 / fps;
      let displayed = interpolateMapStep(from, to, time - started);
      if (time - started >= MAP_STEP_MS) {
        from = displayed; to = { x: to.x + 1, y: 7 };
        started = nextMapStepStart(started, time, time - previousTime);
        displayed = interpolateMapStep(from, to, time - started);
      }
      assert.ok(Math.abs(displayed.x - time / MAP_STEP_MS) < 1e-9, `${fps}Hz at ${time}ms stopped between tiles`);
      assert.equal(displayed.y, 7);
      previousTime = time;
    }
  }
});

test('a network pause or hidden-tab stall resumes one normal step without catch-up', () => {
  assert.equal(nextMapStepStart(0, 150, 1000 / 60), 140);
  assert.equal(nextMapStepStart(0, 600, 1000 / 60), 600);
  assert.equal(nextMapStepStart(0, 5000, 5000), 5000);
  assert.deepEqual(interpolateMapStep({ x: 1, y: 0 }, { x: 2, y: 0 }, 0), { x: 1, y: 0 });
});

test('follow camera has the same elapsed-time response across frame rates and cannot overshoot', () => {
  const expected = 200 * (1 - Math.exp(-500 / 85));
  for (const fps of [20, 30, 60, 120]) {
    let camera = 0;
    for (let frame = 0; frame < fps / 2; frame++) camera = followMapCamera(camera, 200, 1000 / fps);
    assert.ok(Math.abs(camera - expected) < 1e-9);
    assert.ok(camera >= 0 && camera <= 200);
  }
  assert.equal(followMapCamera(10, 200, 0), 10);
  assert.equal(followMapCamera(10, 200, -5), 10);
  assert.ok(followMapCamera(10, 200, 5000) < 200);
});

test('sparse shared positions animate through real doors and never across walls, furniture or people', () => {
  const blocked = [...map.suspectSpots, map.officerSpot];
  const from = { x: 19, y: 8 }, to = { x: 28, y: 8 };
  const path = remoteMapRoute(from, to, map.isValidPosition, blocked);
  assert.ok(path && path.length > Math.abs(to.x-from.x), 'A direct line would cross the dividing wall');
  let previous = from;
  for (const point of path) {
    assert.equal(Math.abs(point.x-previous.x)+Math.abs(point.y-previous.y), 1);
    assert.ok(map.isValidPosition(point));
    assert.ok(!blocked.some(p => p.x===point.x && p.y===point.y));
    const halfway = interpolateMapStep(previous, point, MAP_STEP_MS/2);
    assert.ok(halfway.x===previous.x || halfway.y===previous.y, 'Only one axis moves through each segment');
    previous = point;
  }
  assert.deepEqual(previous, to);
});

test('new shared destination replaces the remaining route from the active segment endpoint', () => {
  const from = { x: 16, y: 10 }, endpoint = { x: 17, y: 10 };
  const inFlight = interpolateMapStep(from, endpoint, 70);
  const replacement = remoteMapRoute(endpoint, { x: 16, y: 8 }, map.isValidPosition, [map.officerSpot]);
  assert.ok(replacement?.length);
  assert.deepEqual(inFlight, { x: 16.5, y: 10 }, 'Planning does not overwrite fractional rendering');
  assert.equal(Math.abs(replacement[0].x-endpoint.x)+Math.abs(replacement[0].y-endpoint.y), 1);
  assert.deepEqual(replacement.at(-1), { x: 16, y: 8 });
});

test('unchanged targets have no replay and impossible snapshots do not invent a route', () => {
  const point = { x: 16, y: 10 };
  assert.deepEqual(remoteMapRoute(point, point, map.isValidPosition), []);
  assert.equal(remoteMapRoute(point, { x: 22, y: 5 }, map.isValidPosition), null);
  assert.equal(remoteMapRoute(point, map.officerSpot, map.isValidPosition, [map.officerSpot]), null);
  const isolated = p => p.y===0 && (p.x===0 || p.x===2);
  assert.equal(remoteMapRoute({ x: 0, y: 0 }, { x: 2, y: 0 }, isolated), null);
});
