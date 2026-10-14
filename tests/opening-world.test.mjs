import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

const source = (await fs.readFile(new URL('../app/components/OpeningWorld.tsx', import.meta.url), 'utf8'))
  .split('type Props =')[0].replace(/^import .*;\r?\n/gm, '');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const world = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const ids = [ ['routine', 'hesitation', 'resolve'], ['order', 'unfinished', 'distance'], ['reputation', 'work', 'belonging'], ['detail', 'silence', 'doubt'], ['echo', 'light', 'stillness'], ['uncertainty', 'weight', 'questions'] ];
const shots = ids.flatMap((choices, scene) => [undefined, ...choices].map(choice => world.openingShot(scene, choice)));

test('all automatic camera destinations have body clearance', () => {
  for (const shot of shots) {
    assert(world.canWalkOpening(shot.position.x, shot.position.y), JSON.stringify(shot));
    assert(world.clearOpeningSegment(shot.position, shot.position), 'camera must not clip a wall at rest');
  }
});

test('every forward, backward, or alternate-choice route is connected and collision-safe', () => {
  for (const a of [{ position: world.OPENING_START }, ...shots]) for (const b of shots) {
    const route = world.findOpeningPath(a.position, b.position);
    assert(route.length > 0, 'reachable shot ' + JSON.stringify(b.position));
    let previous = a.position;
    for (const point of route) {
      assert(world.clearOpeningSegment(previous, point), 'route clips wall or furniture: ' + JSON.stringify({ previous, point }));
      previous = point;
    }
    assert.deepEqual(route.at(-1), b.position);
  }
});

test('rounded routes retain clearance and exact endpoints across all story alternatives', () => {
  let rounded = false;
  for (const a of [{ position: world.OPENING_START }, ...shots]) for (const b of shots) {
    const raw = world.findOpeningPath(a.position, b.position), route = world.makeOpeningRoute(a.position, raw);
    if (route.points.length > raw.length + 1) rounded = true;
    assert.deepEqual(world.sampleOpeningRoute(route, 0), a.position);
    assert.deepEqual(world.sampleOpeningRoute(route, route.distance), b.position);
    for (let i = 1; i < route.points.length; i++) assert(world.clearOpeningSegment(route.points[i - 1], route.points[i]));
  }
  assert(rounded, 'wide corners should actually be rounded');
});

test('automatic acceleration and braking are gradual with zero-speed endpoints', () => {
  assert.equal(world.openingEase(0), 0); assert.equal(world.openingEase(1), 1);
  assert(world.openingEase(.001) < .000001);
  assert(1 - world.openingEase(.999) < .000001);
  for (let i = 1; i <= 100; i++) assert(world.openingEase(i / 100) >= world.openingEase((i - 1) / 100));
});

test('firing requires a first new choice in version3, never polling, a replay mount, or a legacy case', () => {
  const previous = { event: 'case-a', scene: 2 };
  const next = { event: 'case-a', scene: 2, choice: 'work', version: 3 };
  assert(world.shouldPlayOpeningIncident(previous, next, false));
  assert(!world.shouldPlayOpeningIncident(previous, { ...next, version: 2 }, false));
  assert(!world.shouldPlayOpeningIncident(previous, next, true));
  assert(!world.shouldPlayOpeningIncident({ ...previous, choice: 'work' }, next, false));
  assert(!world.shouldPlayOpeningIncident({ ...previous, event: 'case-b' }, next, false));
  assert(!world.shouldPlayOpeningIncident({ ...previous, scene: 1 }, next, false));
});

test('the incident has one short local flash and reduced motion removes flash and recoil', () => {
  let runs = 0, wasFlash = false;
  for (let time = 0; time <= 2000; time += 5) {
    const frame = world.openingIncidentFrame(time, false);
    if (frame.flash && !wasFlash) runs++;
    wasFlash = frame.flash;
    const reduced = world.openingIncidentFrame(time, true);
    assert.equal(reduced.flash, false); assert.equal(reduced.recoil, 0);
  }
  assert.equal(runs, 1);
  assert.equal(world.openingIncidentFrame(1900, false).finished, true);
  assert.equal(world.openingIncidentFrame(1900, false).fall, 1);
});

test('aftermath options approach different physical clues with downward views', () => {
  const watch = world.openingShot(3, 'detail');
  const flask = world.openingShot(3, 'doubt');
  const door = world.openingShot(3, 'silence');
  assert(watch.pitch < -.2);
  assert(flask.pitch < 0);
  assert.notDeepEqual(watch.position, flask.position);
  assert(door.position.y > watch.position.y + 2);
  assert(Math.hypot(watch.look.x - watch.position.x, watch.look.y - watch.position.y) < 1.2);
});

test('watch and terminal stay above the dialogue dock on wide and narrow screens', () => {
  for (const [width, height] of [[550, 360], [256, 416], [640, 400]]) for (const choice of ['detail', 'silence']) {
    const shot = world.openingShot(3, choice);
    const angle = Math.atan2(shot.look.y - shot.position.y, shot.look.x - shot.position.x);
    const pose = { ...shot.position, angle, pitch: shot.pitch, eye: shot.eye, focus: shot.focus };
    const horizon = world.openingHorizon(width, height, pose);
    const depth = (shot.focus.x - pose.x) * Math.cos(angle) + (shot.focus.y - pose.y) * Math.sin(angle);
    const center = horizon + ((pose.eye ?? .79) - shot.focus.height) * width / 1.38 / depth;
    assert(Math.abs(center / height - .28) < .00001);
    if (choice === 'detail') {
      const halfHeight = .11 * width / 1.38 / depth;
      assert((center + halfHeight) / height < .43, 'whole watch must clear dock');
      assert((center - halfHeight) / height > .12, 'whole watch must clear top HUD');
    }
  }
});

test('normal world and doctor are framed above the tall mobile dialogue dock', () => {
  for (const [width, height] of [[550, 360], [256, 400], [640, 400]]) {
    assert.equal(world.openingHorizon(width, height, world.OPENING_START), height * .3);
    for (const scene of [0, 1, 2]) {
      const shot = world.openingShot(scene);
      const angle = Math.atan2(shot.look.y - shot.position.y, shot.look.x - shot.position.x);
      const pose = { ...shot.position, angle, pitch: shot.pitch, focus: shot.focus };
      const depth = (shot.focus.x - pose.x) * Math.cos(angle) + (shot.focus.y - pose.y) * Math.sin(angle);
      const horizon = world.openingHorizon(width, height, pose);
      const face = horizon + (.79 - 1.4) * width / 1.38 / depth;
      const crown = horizon + (.79 - 1.75) * width / 1.38 / depth;
      assert(Math.abs(face / height - .27) < .00001);
      assert(crown / height > .1, 'doctor head must stay below top HUD');
    }
  }
});

test('firing camera retains the full doctor head during approach, gun raise and shot on desktop and mobile', () => {
  for (const [width, height] of [[640, 360], [256, 400]]) for (const choice of ['reputation', 'work', 'belonging']) {
    const shot = world.openingShot(2, choice);
    const base = { ...shot.position, angle: Math.atan2(shot.look.y - shot.position.y, shot.look.x - shot.position.x), pitch: shot.pitch, eye: shot.eye, focus: shot.focus };
    for (const elapsed of [0, 60, 120, 240, 650, 700]) for (const reduced of [false, true]) {
      const pose = world.openingIncidentPose(base, elapsed, reduced);
      const depth = (11.5 - pose.x) * Math.cos(pose.angle) + (3.8 - pose.y) * Math.sin(pose.angle);
      const crown = world.openingHorizon(width, height, pose) + ((pose.eye ?? .79) - 1.75) * width / 1.38 / depth;
      assert(crown / height >= .08, 'full head must clear top HUD during firing');
      if (elapsed >= 240 || reduced) assert.equal(pose.focus.screenY, .4);
    }
  }
});

test('unknown choices cannot select another scene and angles take shortest turn', () => {
  assert.deepEqual(world.openingShot(0, 'detail'), world.openingShot(0));
  assert.deepEqual(world.openingShot(100), world.OPENING_SHOTS[5]);
  assert.equal(world.canWalkOpening(NaN, 5), false);
  assert.equal(world.canWalkOpening(0, 0), false);
  assert.deepEqual(world.findOpeningPath({ x: 0, y: 0 }, world.OPENING_START), []);
  assert(Math.abs(world.openingAngleDelta(Math.PI - .05, -Math.PI + .05) - .1) < .00001);
});
