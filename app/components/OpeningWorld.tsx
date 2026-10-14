'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { playSfx } from '../lib/audio';
import { drawFallenDoctor } from '../lib/pixel-doctor';

// Original small raycasting world. No engine code or assets from DOOM are used.
export type WorldPoint = { x: number; y: number };
type WorldFocus = WorldPoint & { height: number; screenY: number };
export type WorldPose = WorldPoint & { angle: number; pitch: number; eye?: number; focus?: WorldFocus; focusAmount?: number };
export type OpeningShot = { position: WorldPoint; look: WorldPoint; pitch: number; eye?: number; focus?: WorldFocus };
export const OPENING_WORLD = (() => {
  const grid = Array.from({ length: 20 }, () => Array<number>(23).fill(2));
  const room = (x0: number, y0: number, x1: number, y1: number, material: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
      grid[y][x] = x === x0 || x === x1 || y === y0 || y === y1 ? material : 0;
  };
  room(3, 1, 19, 10, 1);
  room(9, 10, 14, 19, 2);
  room(2, 12, 9, 18, 1);
  room(14, 12, 21, 18, 2);
  for (const x of [10, 11, 12, 13]) grid[10][x] = 0;
  grid[14][9] = 0;
  grid[15][14] = 0;
  // Glazed partitions and closed office doors are real occluding surfaces.
  for (const y of [12, 13, 16, 17]) grid[y][9] = 3;
  for (const y of [12, 13, 14, 16, 17]) grid[y][14] = 3;
  grid[14][2] = 4;
  grid[15][21] = 4;
  grid[1][11] = 3;
  grid[1][12] = 3;
  return grid;
})();
export const OPENING_OBSTACLES: readonly WorldPoint[] = [
  { x: 10, y: 4 }, { x: 11, y: 4 }, { x: 12, y: 4 },
  { x: 5, y: 3 }, { x: 6, y: 3 }, { x: 16, y: 3 }, { x: 17, y: 3 },
  { x: 4, y: 14 }, { x: 5, y: 14 }, { x: 18, y: 14 }, { x: 19, y: 14 },
];
export const OPENING_START: WorldPose = { x: 11.5, y: 17.5, angle: -Math.PI / 2, pitch: 0 };
export function canWalkOpening(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && OPENING_WORLD[Math.floor(y)]?.[Math.floor(x)] === 0 &&
    !OPENING_OBSTACLES.some(p => p.x === Math.floor(x) && p.y === Math.floor(y));
}
export function clearOpeningSegment(a: WorldPoint, b: WorldPoint): boolean {
  const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / .08));
  for (let i = 0; i <= count; i++) {
    const x = a.x + (b.x - a.x) * i / count, y = a.y + (b.y - a.y) * i / count;
    for (const [dx, dy] of [[-.19, -.19], [.19, -.19], [-.19, .19], [.19, .19]])
      if (!canWalkOpening(x + dx, y + dy)) return false;
  }
  return true;
}
/** Breadth-first routes plus sight-line compression keep every animation inside the world. */
export function findOpeningPath(from: WorldPoint, to: WorldPoint): WorldPoint[] {
  if (!canWalkOpening(from.x, from.y) || !canWalkOpening(to.x, to.y)) return [];
  if (clearOpeningSegment(from, to)) return [to];
  const key = (x: number, y: number) => x + ',' + y;
  const start = { x: Math.floor(from.x), y: Math.floor(from.y) };
  const end = { x: Math.floor(to.x), y: Math.floor(to.y) };
  const queue = [start], parents = new Map<string, WorldPoint | null>([[key(start.x, start.y), null]]);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current.x === end.x && current.y === end.y) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: current.x + dx, y: current.y + dy }, id = key(next.x, next.y);
      if (!parents.has(id) && canWalkOpening(next.x + .5, next.y + .5)) {
        parents.set(id, current); queue.push(next);
      }
    }
  }
  if (!parents.has(key(end.x, end.y))) return [];
  const raw: WorldPoint[] = [to];
  let point: WorldPoint | null = end;
  while (point) { raw.unshift({ x: point.x + .5, y: point.y + .5 }); point = parents.get(key(point.x, point.y)) ?? null; }
  raw.unshift(from);
  const result: WorldPoint[] = [];
  for (let current = 0; current < raw.length - 1;) {
    let next = raw.length - 1;
    while (next > current + 1 && !clearOpeningSegment(raw[current], raw[next])) next--;
    result.push(raw[next]); current = next;
  }
  return result;
}

export type OpeningRoute = { points: WorldPoint[]; lengths: number[]; distance: number };
export function openingEase(t: number): number {
  const p = Math.max(0, Math.min(1, t));
  return p * p * p * (p * (p * 6 - 15) + 10);
}
/** Round only corners with verified body clearance; narrow doorways retain safe straight segments. */
export function makeOpeningRoute(from: WorldPoint, path: WorldPoint[]): OpeningRoute {
  const raw = [from, ...path], points: WorldPoint[] = [from];
  for (let i = 1; i < raw.length - 1; i++) {
    const a = raw[i - 1], b = raw[i], c = raw[i + 1];
    const before = Math.hypot(b.x - a.x, b.y - a.y), after = Math.hypot(c.x - b.x, c.y - b.y);
    const cut = Math.min(.46, before * .3, after * .3);
    if (cut < .02) { points.push(b); continue; }
    const entry = { x: b.x + (a.x - b.x) * cut / before, y: b.y + (a.y - b.y) * cut / before };
    const exit = { x: b.x + (c.x - b.x) * cut / after, y: b.y + (c.y - b.y) * cut / after };
    const curve = [entry];
    for (let step = 1; step <= 10; step++) {
      const t = step / 10, u = 1 - t;
      curve.push({ x: u * u * entry.x + 2 * u * t * b.x + t * t * exit.x, y: u * u * entry.y + 2 * u * t * b.y + t * t * exit.y });
    }
    let previous = points[points.length - 1];
    const safe = curve.every(point => { const clear = clearOpeningSegment(previous, point); previous = point; return clear; });
    if (safe && clearOpeningSegment(previous, c)) points.push(...curve); else points.push(b);
  }
  if (raw.length > 1) points.push(raw[raw.length - 1]);
  const lengths = [0]; let distance = 0;
  for (let i = 1; i < points.length; i++) { distance += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y); lengths.push(distance); }
  return { points, lengths, distance };
}
export function sampleOpeningRoute(route: OpeningRoute, distance: number): WorldPoint {
  if (distance <= 0 || route.points.length === 1) return route.points[0];
  if (distance >= route.distance) return route.points[route.points.length - 1];
  let index = 1; while (index < route.lengths.length - 1 && route.lengths[index] < distance) index++;
  const a = route.points[index - 1], b = route.points[index];
  const t = (distance - route.lengths[index - 1]) / Math.max(.00001, route.lengths[index] - route.lengths[index - 1]);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
export function openingIncidentFrame(elapsed: number, reduced: boolean) {
  const fireAt = reduced ? 150 : 650, finishAt = reduced ? 600 : 1900;
  return {
    fireAt, finished: elapsed >= finishAt,
    raised: reduced ? 1 : openingEase(elapsed / 420) * (1 - openingEase((elapsed - 1400) / 500)),
    flash: !reduced && elapsed >= fireAt && elapsed < fireAt + 65,
    recoil: reduced ? 0 : Math.max(0, 1 - (elapsed - fireAt) / 190) * Number(elapsed >= fireAt),
    fall: reduced ? Number(elapsed >= fireAt) : openingEase((elapsed - fireAt - 90) / 760),
  };
}
export function shouldPlayOpeningIncident(previous: { event: string; scene: number; choice?: string }, next: { event: string; scene: number; choice?: string; version?: number }, handled: boolean): boolean {
  return next.version === 3 && !handled && previous.event === next.event && previous.scene === 2 && next.scene === 2 && !previous.choice && !!next.choice;
}

const doctor = { x: 11.5, y: 3.8 };
export const OPENING_SHOTS: readonly OpeningShot[] = [
  { position: { x: 11.5, y: 11.5 }, look: doctor, pitch: 0 },
  { position: { x: 11.5, y: 7.2 }, look: doctor, pitch: 0 },
  { position: { x: 11.5, y: 6.3 }, look: doctor, pitch: .035 },
  { position: { x: 10.5, y: 7.3 }, look: { x: 11.3, y: 5.6 }, pitch: -.14 },
  { position: { x: 11.5, y: 12.5 }, look: { x: 11.5, y: 17.5 }, pitch: 0 },
  { position: { x: 11.5, y: 16.5 }, look: { x: 11.5, y: 11 }, pitch: .04 },
];
export function openingShot(sceneIndex: number, choiceId?: string): OpeningShot {
  const scene = Math.max(0, Math.min(5, Math.floor(sceneIndex) || 0));
  const base = OPENING_SHOTS[scene];
  const choices: Record<string, OpeningShot> = {
    routine: { position: { x: 11.5, y: 9.2 }, look: doctor, pitch: 0 },
    hesitation: { position: { x: 10.5, y: 9.2 }, look: doctor, pitch: 0 },
    resolve: { position: { x: 12.5, y: 8.7 }, look: doctor, pitch: -.025 },
    order: { position: { x: 10.5, y: 6.5 }, look: { x: 10.9, y: 4.6 }, pitch: -.035 },
    unfinished: { position: { x: 11.5, y: 6.4 }, look: doctor, pitch: .03 },
    distance: { position: { x: 12.5, y: 7.4 }, look: doctor, pitch: 0 },
    reputation: { position: { x: 11.3, y: 6.2 }, look: doctor, pitch: .035 },
    work: { position: { x: 12.5, y: 6.4 }, look: doctor, pitch: .025 },
    belonging: { position: { x: 10.5, y: 6.3 }, look: doctor, pitch: .025 },
    detail: { position: { x: 10.5, y: 6.7 }, look: { x: 10.75, y: 5.65 }, pitch: -.26, eye: .34, focus: { x: 10.75, y: 5.65, height: .135, screenY: .28 } },
    silence: { position: { x: 12.5, y: 9.5 }, look: { x: 13.6, y: 9.7 }, pitch: -.04, focus: { x: 13.6, y: 9.7, height: 1.025, screenY: .28 } },
    doubt: { position: { x: 12.5, y: 5.75 }, look: { x: 12.4, y: 4.5 }, pitch: -.09, focus: { x: 12.4, y: 4.48, height: .985, screenY: .24 } },
    echo: { position: { x: 11.5, y: 14.2 }, look: { x: 11.5, y: 18 }, pitch: 0 },
    light: { position: { x: 8.3, y: 14.5 }, look: { x: 5, y: 14.5 }, pitch: -.025 },
    stillness: { position: { x: 15.5, y: 15.5 }, look: { x: 20.9, y: 15.5 }, pitch: 0 },
    uncertainty: { position: { x: 11.5, y: 14.5 }, look: { x: 11.5, y: 10.5 }, pitch: .02 },
    weight: { position: { x: 13.3, y: 16.5 }, look: { x: 11.5, y: 13.5 }, pitch: 0 },
    questions: { position: { x: 10.5, y: 15.2 }, look: { x: 11.5, y: 12.5 }, pitch: .02 },
  };
  const valid = [ ['routine', 'hesitation', 'resolve'], ['order', 'unfinished', 'distance'], ['reputation', 'work', 'belonging'], ['detail', 'silence', 'doubt'], ['echo', 'light', 'stillness'], ['uncertainty', 'weight', 'questions'] ];
  const selected = choiceId && valid[scene].includes(choiceId) ? choices[choiceId] : base;
  // Protect the doctor's upper body from both the mobile dock and desktop top edge.
  return scene < 3 ? { ...selected, focus: { ...doctor, height: 1.4, screenY: .27 } } : selected;
}
export function openingAngleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
/** Keep physical inspection targets above the reading dock at every aspect ratio. */
export function openingHorizon(width: number, height: number, pose: WorldPose): number {
  const normal = height * (.3 + pose.pitch);
  if (!pose.focus) return normal;
  const depth = (pose.focus.x - pose.x) * Math.cos(pose.angle) + (pose.focus.y - pose.y) * Math.sin(pose.angle);
  if (depth < .2) return normal;
  const framed = height * pose.focus.screenY - ((pose.eye ?? .79) - pose.focus.height) * width / 1.38 / depth;
  return normal + (framed - normal) * (pose.focusAmount ?? 1);
}
export function openingIncidentPose(pose: WorldPose, elapsed: number, reduced = false): WorldPose {
  const screenY = .27 + .13 * (reduced ? 1 : openingEase(elapsed / 240));
  return { ...pose, focus: { ...doctor, height: 1.4, screenY }, focusAmount: 1 };
}

type Props = {
  sceneIndex: number;
  choiceId?: string;
  completed?: boolean;
  paused?: boolean;
  skipToken?: number;
  reducedMotion?: boolean;
  onTravelChange?: (moving: boolean) => void;
  scriptVersion?: 2 | 3;
  eventKey?: string;
};
type Travel = { route: OpeningRoute; elapsed: number; duration: number; start: WorldPose; shot: OpeningShot };
type Incident = { elapsed: number; sounded: boolean };
type Sprite = WorldPoint & { texture: string; width: number; height: number; bottom?: number; opacity?: number };
type Art = { textures: Record<string, HTMLCanvasElement | HTMLImageElement>; wallPixels: Uint8ClampedArray[] };
type RenderBuffers = { image?: ImageData; depth?: Float32Array; vignette?: CanvasGradient; width?: number; height?: number };

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const ease = (v: number) => v * v * (3 - 2 * v);
const color = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const FLOOR_COLORS = [color('#708b80'), color('#7d9388'), color('#586a6b'), color('#657b79')];

function makeArt(): Art {
  const textures: Art['textures'] = {};
  const draw = (name: string, w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) => {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!; ctx.imageSmoothingEnabled = false; paint(ctx); textures[name] = canvas; return canvas;
  };
  const rect = (c: CanvasRenderingContext2D, fill: string, x: number, y: number, w: number, h: number) => { c.fillStyle = fill; c.fillRect(x, y, w, h); };
  const walls = [1, 2, 3, 4].map(material => draw('wall' + material, 64, 64, c => {
    rect(c, material === 1 ? '#96aaa5' : '#465763', 0, 0, 64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const noise = (x * 17 + y * 23 + (x * y) % 13) % 11;
      if (noise < 2) rect(c, material === 1 ? '#8a9f99' : '#40515c', x, y, 1, 1);
    }
    rect(c, '#1c323a', 0, 0, 64, 4); rect(c, '#bad0c5', 0, 4, 64, 2);
    rect(c, '#476b69', 0, 38, 64, 19); rect(c, '#233e43', 0, 38, 64, 3);
    rect(c, '#1b2c35', 0, 59, 64, 5); rect(c, '#668582', 0, 56, 64, 3);
    rect(c, '#6f8988', 0, 6, 1, 32); rect(c, '#a7bcb1', 63, 6, 1, 32);
    if (material === 2) {
      rect(c, '#b39a63', 0, 34, 64, 3); rect(c, '#243945', 5, 9, 54, 18);
      for (let y = 12; y < 24; y += 4) rect(c, '#142833', 9, y, 46, 2);
      for (const x of [3, 60]) for (const y of [7, 32, 54]) rect(c, '#a5b5b2', x, y, 1, 1);
    }
    if (material === 3) {
      rect(c, '#152a33', 3, 9, 58, 35); rect(c, '#528c99', 6, 12, 52, 29);
      rect(c, '#80b5bc', 8, 14, 19, 20); rect(c, '#355a6f', 29, 14, 27, 25);
      rect(c, '#accac6', 12, 15, 2, 19); rect(c, '#608f9c', 37, 15, 12, 24);
      rect(c, '#1d3943', 30, 10, 3, 33); rect(c, '#172f37', 5, 32, 54, 3);
    }
    if (material === 4) {
      rect(c, '#142b32', 4, 4, 56, 58); rect(c, '#736e65', 8, 7, 48, 54);
      rect(c, '#a09277', 10, 9, 3, 49); rect(c, '#263941', 18, 14, 28, 15);
      rect(c, '#a7c3b7', 21, 18, 22, 6); rect(c, '#dfb562', 46, 37, 3, 7);
      rect(c, '#292f31', 16, 47, 28, 2);
    }
  }));
  draw('bench', 128, 64, c => {
    rect(c, '#142832', 1, 21, 126, 40); rect(c, '#667e81', 3, 23, 122, 33);
    rect(c, '#acb8aa', 0, 15, 128, 12); rect(c, '#dee0c6', 2, 15, 124, 3);
    rect(c, '#2b464e', 0, 25, 128, 4);
    for (const x of [5, 45, 85]) { rect(c, '#8ba29a', x, 32, 36, 20); rect(c, '#405b63', x + 3, 35, 29, 2); rect(c, '#213a42', x + 15, 39, 9, 3); }
    rect(c, '#edf0d4', 17, 7, 28, 9); rect(c, '#6a8280', 20, 9, 21, 1); rect(c, '#899d90', 20, 12, 13, 1);
    rect(c, '#8d7460', 49, 12, 18, 3); rect(c, '#d6ac6e', 50, 10, 16, 3);
    rect(c, '#1c333c', 9, 55, 8, 9); rect(c, '#1c333c', 111, 55, 8, 9);
  });
  draw('workstation', 96, 88, c => {
    rect(c, '#152b36', 0, 56, 96, 10); rect(c, '#9eafac', 2, 56, 92, 4);
    rect(c, '#536d75', 6, 66, 84, 20); rect(c, '#203b48', 42, 65, 4, 21);
    rect(c, '#11252f', 19, 9, 59, 44); rect(c, '#657e86', 21, 11, 55, 39);
    rect(c, '#174e59', 24, 14, 49, 32); rect(c, '#62c5bc', 28, 19, 19, 2);
    for (let y = 25; y < 40; y += 5) { rect(c, '#84b9ae', 28, y, 32 - y % 9, 1); rect(c, '#d7b871', 62, y, 5, 2); }
    rect(c, '#183340', 42, 50, 13, 7); rect(c, '#627d86', 27, 60, 35, 3);
  });
  draw('plant', 48, 80, c => {
    rect(c, '#193531', 22, 16, 5, 45);
    for (const [x, y, w, h] of [[3, 9, 22, 13], [24, 18, 21, 13], [5, 34, 22, 12], [21, 2, 17, 16], [23, 41, 21, 10]]) {
      rect(c, '#214a3c', x, y, w, h); rect(c, '#4e8356', x + 2, y, w - 5, 6); rect(c, '#86a468', x + 3, y + 1, w - 9, 2);
    }
    rect(c, '#172d31', 11, 58, 30, 7); rect(c, '#ab8460', 14, 64, 24, 16); rect(c, '#ceaa77', 14, 64, 5, 14); rect(c, '#765f50', 33, 64, 5, 16);
  });
  draw('flask', 32, 48, c => {
    rect(c, '#172b32', 12, 1, 9, 21); rect(c, '#162d32', 8, 19, 17, 8); rect(c, '#162d32', 3, 27, 27, 18);
    rect(c, '#c1e3ce', 14, 3, 5, 20); rect(c, '#a1c8bd', 9, 24, 15, 17); rect(c, '#c8e2d0', 6, 29, 21, 13);
    rect(c, '#568869', 8, 34, 18, 8); rect(c, '#92b37e', 7, 32, 19, 4); rect(c, '#e7f0d8', 8, 29, 3, 9);
    rect(c, '#b0915d', 11, 0, 11, 5);
  });
  draw('watch', 64, 40, c => {
    rect(c, '#2b2f33', 0, 14, 64, 13); rect(c, '#716047', 1, 16, 62, 8);
    rect(c, '#132934', 19, 3, 27, 34); rect(c, '#d6bb75', 22, 5, 22, 30); rect(c, '#f0ddb1', 25, 8, 16, 24);
    rect(c, '#25474a', 27, 11, 12, 18); rect(c, '#c4d4b3', 29, 13, 8, 14);
    rect(c, '#253b3c', 33, 15, 1, 7); rect(c, '#253b3c', 30, 20, 4, 1);
    rect(c, '#f2eccf', 24, 9, 2, 16); rect(c, '#596760', 39, 11, 2, 18);
    rect(c, '#f4f0ce', 30, 12, 2, 2); rect(c, '#39565c', 26, 24, 6, 1);
    // Pixel digits on the physical face remain clear when the camera kneels.
    rect(c, '#203a3f', 23, 17, 21, 9);
    const digits: Record<string, string[]> = { '2':['111','001','111','100','111'], '1':['010','110','010','010','111'], '7':['111','001','010','010','010'], ':':['0','1','0','1','0'] };
    let cursor = 24;
    for (const ch of '21:17') { const glyph = digits[ch]; for (let row = 0; row < 5; row++) for (let col = 0; col < glyph[row].length; col++) if (glyph[row][col] === '1') rect(c, '#e5e5ba', cursor + col, 19 + row, 1, 1); cursor += ch === ':' ? 2 : 4; }
  });
  draw('terminal', 48, 64, c => {
    rect(c, '#11252e', 3, 0, 42, 64); rect(c, '#637d81', 5, 2, 38, 59); rect(c, '#173e48', 8, 7, 32, 34);
    rect(c, '#88cbb3', 11, 10, 26, 4); for (let y = 20; y < 36; y += 6) rect(c, '#67a597', 11, y, 21, 2);
    rect(c, '#c8b57f', 9, 47, 5, 5); rect(c, '#d0dfcf', 18, 47, 5, 5); rect(c, '#e29772', 31, 47, 5, 5);
  });
  draw('doctor', 64, 112, c => {
    rect(c, '#142631', 18, 91, 12, 21); rect(c, '#142631', 37, 91, 12, 21);
    rect(c, '#18323e', 12, 41, 44, 56); rect(c, '#e3dfc8', 16, 44, 36, 49);
    rect(c, '#a8bbb0', 39, 44, 12, 49); rect(c, '#fff0d1', 16, 45, 5, 43);
    rect(c, '#486c74', 28, 43, 9, 45); rect(c, '#d5d8bf', 30, 44, 3, 14);
    rect(c, '#1a2d37', 22, 10, 28, 32); rect(c, '#d5a77b', 25, 15, 22, 27);
    rect(c, '#f0c79b', 25, 18, 7, 18); rect(c, '#a27461', 42, 18, 5, 22);
    rect(c, '#d9dbca', 19, 8, 32, 11); rect(c, '#a6b5b0', 19, 16, 6, 16); rect(c, '#a6b5b0', 46, 15, 5, 16);
    rect(c, '#1d3340', 24, 24, 24, 3); rect(c, '#163440', 26, 25, 7, 5); rect(c, '#163440', 39, 25, 7, 5);
    rect(c, '#b1d0c8', 27, 26, 5, 2); rect(c, '#b1d0c8', 40, 26, 5, 2); rect(c, '#f4dfb8', 32, 35, 10, 3);
    rect(c, '#f2e6cb', 9, 48, 11, 29); rect(c, '#afc3b8', 47, 48, 11, 29);
    rect(c, '#d3a07c', 11, 76, 10, 9); rect(c, '#d3a07c', 46, 75, 10, 10);
    rect(c, '#e3c369', 20, 54, 7, 5); rect(c, '#23414b', 22, 54, 3, 3);
  });
  draw('fallen', 96, 48, c => drawFallenDoctor(c));
  draw('alarm', 48, 24, c => { rect(c, '#142b33', 0, 0, 48, 24); rect(c, '#bf6752', 3, 3, 42, 16); rect(c, '#ffc382', 7, 6, 34, 4); rect(c, '#864939', 7, 15, 34, 3); });
  draw('sign', 128, 32, c => { rect(c, '#132e36', 0, 0, 128, 32); rect(c, '#92b6a5', 1, 1, 126, 2); c.fillStyle = '#e7d8a3'; c.font = 'bold 12px monospace'; c.textAlign = 'center'; c.fillText('ASTER / LAB 01', 64, 20); });
  return { textures, wallPixels: walls.map(w => w.getContext('2d')!.getImageData(0, 0, 64, 64).data) };
}

function renderWorld(ctx: CanvasRenderingContext2D, width: number, height: number, pose: WorldPose, art: Art, scene: number, time: number, moving: boolean, reduced: boolean, buffers: RenderBuffers, incidentElapsed: number | null, shotFallen: boolean) {
  if (buffers.width !== width || buffers.height !== height) {
    buffers.width = width; buffers.height = height;
    buffers.image = ctx.createImageData(width, height); buffers.depth = new Float32Array(width);
    buffers.vignette = ctx.createRadialGradient(width / 2, height * .48, width * .25, width / 2, height * .5, Math.max(width, height) * .74);
    buffers.vignette.addColorStop(0, 'rgba(5,16,23,0)'); buffers.vignette.addColorStop(1, 'rgba(5,16,23,.35)');
  }
  const image = buffers.image!, pixels = image.data;
  const dirX = Math.cos(pose.angle), dirY = Math.sin(pose.angle), planeX = -dirY * .69, planeY = dirX * .69;
  const focal = width / 1.38, eye = pose.eye ?? .79, wallHeight = 2.35;
  const bob = moving && !reduced ? Math.sin(time * .009) * Math.min(2, height * .007) : 0;
  const horizon = Math.round(openingHorizon(width, height, pose) + bob);
  const [floorA, floorB, hallA, hallB] = FLOOR_COLORS;
  for (let y = 0; y < height; y++) {
    const ground = y > horizon;
    const rowDistance = focal * (ground ? eye : wallHeight - eye) / Math.max(1, Math.abs(y - horizon));
    const stepX = rowDistance * planeX * 2 / width, stepY = rowDistance * planeY * 2 / width;
    let wx = pose.x + rowDistance * (dirX - planeX), wy = pose.y + rowDistance * (dirY - planeY);
    for (let x = 0; x < width; x++, wx += stepX, wy += stepY) {
      const tileX = Math.floor(wx), tileY = Math.floor(wy), tx = wx - tileX, ty = wy - tileY;
      const fade = clamp(1.08 - rowDistance * .045, .25, 1);
      let r: number, g: number, b: number;
      if (ground) {
        const base = wy < 10 ? ((tileX + tileY) % 2 ? floorA : floorB) : ((tileX + tileY) % 2 ? hallA : hallB);
        const grout = tx < .026 || ty < .026 ? .58 : 1;
        const grain = ((Math.floor(tx * 32) * 13 + Math.floor(ty * 32) * 7) % 17 === 0) ? .94 : 1;
        const line = wy > 10 && (Math.abs(wx - 10.12) < .045 || Math.abs(wx - 13.87) < .045);
        const surface = grout * grain;
        r = line ? 181 : base[0] * surface; g = line ? 157 : base[1] * surface; b = line ? 93 : base[2] * surface;
      } else {
        const lamp = tileX % 4 === 3 && tileY % 3 === 2 && tx > .13 && tx < .88 && ty > .37 && ty < .64;
        const seam = tx < .018 || ty < .018;
        [r, g, b] = lamp ? [191, 202, 174] : seam ? [44, 61, 65] : [60, 78, 79];
      }
      const i = (y * width + x) * 4; pixels[i] = r * fade; pixels[i + 1] = g * fade; pixels[i + 2] = b * fade; pixels[i + 3] = 255;
    }
  }
  const depth = buffers.depth!;
  for (let x = 0; x < width; x++) {
    const cameraX = 2 * x / width - 1, rx = dirX + planeX * cameraX, ry = dirY + planeY * cameraX;
    let mx = Math.floor(pose.x), my = Math.floor(pose.y), side = 0, material = 2;
    const dx = Math.abs(1 / rx), dy = Math.abs(1 / ry), sx = rx < 0 ? -1 : 1, sy = ry < 0 ? -1 : 1;
    let sideX = (rx < 0 ? pose.x - mx : mx + 1 - pose.x) * dx, sideY = (ry < 0 ? pose.y - my : my + 1 - pose.y) * dy;
    for (let count = 0; count < 64; count++) {
      if (sideX < sideY) { sideX += dx; mx += sx; side = 0; } else { sideY += dy; my += sy; side = 1; }
      material = OPENING_WORLD[my]?.[mx] ?? 2;
      if (material) break;
    }
    const distance = Math.max(.06, side ? sideY - dy : sideX - dx); depth[x] = distance;
    const scale = focal / distance, top = horizon + (eye - wallHeight) * scale, bottom = horizon + eye * scale;
    let wallX = side ? pose.x + distance * rx : pose.y + distance * ry; wallX -= Math.floor(wallX);
    const texture = art.wallPixels[material - 1] ?? art.wallPixels[0];
    let texX = Math.floor(wallX * 64); if ((!side && rx > 0) || (side && ry < 0)) texX = 63 - texX;
    const shade = clamp(1.13 - distance * .052, .28, 1) * (side ? .81 : 1);
    for (let y = Math.max(0, Math.floor(top)); y < Math.min(height, Math.ceil(bottom)); y++) {
      const ty = clamp(Math.floor((y - top) * 64 / (bottom - top)), 0, 63), ti = (ty * 64 + texX) * 4, i = (y * width + x) * 4;
      pixels[i] = texture[ti] * shade; pixels[i + 1] = texture[ti + 1] * shade; pixels[i + 2] = texture[ti + 2] * shade;
    }
  }
  ctx.putImageData(image, 0, 0);
  const sprites: Sprite[] = [
    { x: 11.5, y: 4.6, texture: 'bench', width: 3.1, height: 1 },
    { x: 5.8, y: 3.5, texture: 'workstation', width: 2.2, height: 1.55 },
    { x: 16.8, y: 3.5, texture: 'workstation', width: 2.2, height: 1.55 },
    { x: 5, y: 14.5, texture: 'workstation', width: 2.3, height: 1.55 },
    { x: 19, y: 14.5, texture: 'workstation', width: 2.3, height: 1.55 },
    { x: 4.5, y: 8.7, texture: 'plant', width: .75, height: 1.3 },
    { x: 17.8, y: 8.7, texture: 'plant', width: .75, height: 1.3 },
    { x: 10, y: 17.8, texture: 'plant', width: .65, height: 1.2 },
    { x: 13.6, y: 9.7, texture: 'terminal', width: .5, height: .75, bottom: .65 },
    { x: 12.4, y: 4.48, texture: 'flask', width: .34, height: .49, bottom: .74 },
    { x: 11.5, y: 10.03, texture: 'sign', width: 1.75, height: .44, bottom: 1.68 },
    { x: 11.5, y: 18.87, texture: 'alarm', width: .65, height: .33, bottom: 1.65 },
  ];
  const action = incidentElapsed === null ? null : openingIncidentFrame(incidentElapsed, reduced);
  const fallen = scene >= 3 || (scene === 2 && shotFallen);
  const fall = action?.fall ?? Number(fallen);
  if (scene < 3 && fall < 1) sprites.push({ x: 11.5 + fall * .15, y: 3.8 + fall * .3, texture: 'doctor', width: .94 + fall * .3, height: 1.75 * (1 - fall * .65), opacity: 1 - openingEase((fall - .4) / .6) });
  if (fall > .25) sprites.push({ x: 11.65, y: 5.4, texture: 'fallen', width: 1.7, height: .68, opacity: openingEase((fall - .25) / .75) });
  if (fallen) sprites.push({ x: 10.75, y: 5.65, texture: 'watch', width: .38, height: .22, bottom: .025 });
  const determinant = 1 / (planeX * dirY - dirX * planeY);
  const visible = sprites.map(sprite => {
    const dx = sprite.x - pose.x, dy = sprite.y - pose.y;
    return { ...sprite, screenX: determinant * (dirY * dx - dirX * dy), distance: determinant * (-planeY * dx + planeX * dy) };
  }).filter(s => s.distance > .14).sort((a, b) => b.distance - a.distance);
  for (const sprite of visible) {
    const texture = art.textures[sprite.texture]; if (!texture) continue;
    const scale = focal / sprite.distance, sizeX = sprite.width * scale, sizeY = sprite.height * scale;
    const center = width / 2 * (1 + sprite.screenX / sprite.distance), left = center - sizeX / 2;
    const top = horizon + (eye - (sprite.bottom ?? 0) - sprite.height) * scale;
    const textureWidth = texture instanceof HTMLImageElement ? texture.naturalWidth : texture.width;
    const textureHeight = texture instanceof HTMLImageElement ? texture.naturalHeight : texture.height;
    ctx.globalAlpha = clamp(1.2 - sprite.distance * .033, .5, 1) * (sprite.opacity ?? 1);
    // One draw per visible span, rather than one expensive canvas call per screen column.
    const first = Math.max(0, Math.ceil(left)), last = Math.min(width, Math.floor(left + sizeX));
    let begin = -1;
    for (let x = first; x <= last; x++) {
      const visible = x < last && sprite.distance <= depth[x] + .08;
      if (visible && begin < 0) begin = x;
      if (!visible && begin >= 0) {
        const sourceX = clamp((begin - left) / sizeX * textureWidth, 0, textureWidth - 1);
        const sourceWidth = Math.min(textureWidth - sourceX, (x - begin) / sizeX * textureWidth);
        if (sourceWidth > 0) ctx.drawImage(texture, sourceX, 0, sourceWidth, textureHeight, begin, Math.round(top), x - begin, Math.round(sizeY));
        begin = -1;
      }
    }
  }
  ctx.globalAlpha = 1;
  // Quiet optical vignette, no scanline overlays or drawn HUD competing with HTML.
  ctx.fillStyle = buffers.vignette!; ctx.fillRect(0, 0, width, height);
  if (scene === 5) { ctx.fillStyle = 'rgba(202,82,48,.055)'; ctx.fillRect(0, 0, width, height); }
  if (action) drawIncident(ctx, width, height, action);
}

function drawIncident(ctx: CanvasRenderingContext2D, width: number, height: number, action: ReturnType<typeof openingIncidentFrame>) {
  if (action.raised <= 0) return;
  const scale = Math.max(1, Math.min(width / 145, height / 135));
  ctx.save(); ctx.translate(Math.round(width * .55), Math.round(height + (1 - action.raised) * 78 * scale + action.recoil * 6 * scale)); ctx.scale(scale, scale);
  const box = (fill: string, x: number, y: number, w: number, h: number) => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); };
  // Original unbranded silhouette; anonymous gloves and sleeve reveal no suspect identity.
  box('#111b27', -26, -30, 47, 35); box('#3c4c56', -22, -28, 39, 29); box('#6b7980', -22, -27, 8, 22);
  box('#131c26', -19, -45, 34, 27); box('#53606a', -16, -43, 26, 22); box('#889394', -16, -43, 8, 18);
  box('#14202a', -10, -78, 23, 44); box('#657780', -8, -75, 19, 36); box('#98a8a6', -8, -75, 6, 32); box('#394d5a', 7, -73, 4, 35);
  box('#101c26', -8, -81, 19, 10); box('#b8c4b7', -5, -79, 12, 2); box('#182b37', -3, -76, 8, 4); box('#d6d8bc', 0, -85, 3, 5);
  box('#263944', -14, -48, 4, 15); box('#a4ada5', -12, -49, 8, 3); box('#1c2b36', -9, -38, 4, 15);
  if (action.flash) {
    ctx.fillStyle = '#f3bf62'; ctx.beginPath(); ctx.moveTo(1, -111); ctx.lineTo(7, -96); ctx.lineTo(21, -101); ctx.lineTo(12, -88); ctx.lineTo(17, -79); ctx.lineTo(1, -86); ctx.lineTo(-12, -79); ctx.lineTo(-8, -92); ctx.lineTo(-17, -100); ctx.lineTo(-2, -97); ctx.closePath(); ctx.fill();
    box('#fff0b3', -3, -98, 8, 14); box('#fff7d5', -1, -95, 4, 9);
  }
  ctx.restore();
}

export default function OpeningWorld({ sceneIndex, choiceId, completed = false, paused = false, skipToken = 0, reducedMotion, onTravelChange, scriptVersion = 2, eventKey = 'opening' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pose = useRef<WorldPose>({ ...OPENING_START });
  const travel = useRef<Travel | null>(null);
  const incident = useRef<Incident | null>(null);
  const incidentQueued = useRef(false);
  const incidentHandled = useRef(sceneIndex > 2 || (sceneIndex === 2 && !!choiceId));
  const shotFallen = useRef(scriptVersion === 3 && (sceneIndex > 2 || (sceneIndex === 2 && !!choiceId)));
  const previousStory = useRef({ event: eventKey, scene: sceneIndex, choice: choiceId });
  const buffers = useRef<RenderBuffers>({});
  const art = useRef<Art | null>(null);
  const notify = useRef(onTravelChange); notify.current = onTravelChange;
  const scene = useRef(sceneIndex); scene.current = clamp(sceneIndex, 0, 5);
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const reduced = useRef(false);
  const moving = useRef<boolean | null>(null);
  const skip = useRef(skipToken);
  const lastFrame = useRef(0);
  const lastRender = useRef(0);
  const lastStep = useRef(0);
  const dirty = useRef(true);
  const wake = useRef<() => void>(() => {});
  const travelChanged = (value: boolean) => { if (moving.current !== value) { moving.current = value; notify.current?.(value); } };

  useLayoutEffect(() => {
    reduced.current = reducedMotion ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (previousStory.current.event !== eventKey) {
      pose.current = { ...OPENING_START }; incident.current = null; incidentQueued.current = false;
      incidentHandled.current = sceneIndex > 2 || (sceneIndex === 2 && !!choiceId);
    }
    if (shouldPlayOpeningIncident(previousStory.current, { event: eventKey, scene: sceneIndex, choice: choiceId, version: scriptVersion }, incidentHandled.current)) {
      incidentQueued.current = true; incidentHandled.current = true; shotFallen.current = false;
    } else if (sceneIndex !== 2) { incident.current = null; incidentQueued.current = false; }
    if (!incidentQueued.current && !incident.current) shotFallen.current = scriptVersion === 3 && sceneIndex === 2 && !!choiceId;
    previousStory.current = { event: eventKey, scene: sceneIndex, choice: choiceId };
    const shot = openingShot(sceneIndex, choiceId), path = findOpeningPath(pose.current, shot.position);
    const route = makeOpeningRoute(pose.current, path), distance = route.distance;
    const angle = Math.atan2(shot.look.y - shot.position.y, shot.look.x - shot.position.x);
    const turn = Math.abs(openingAngleDelta(pose.current.angle, angle));
    dirty.current = true; wake.current();
    if (reduced.current || completed || (distance < .025 && turn < .025)) {
      pose.current = { ...shot.position, angle, pitch: shot.pitch, eye: shot.eye, focus: shot.focus }; travel.current = null;
      if (incidentQueued.current) { incident.current = { elapsed: 0, sounded: false }; incidentQueued.current = false; travelChanged(true); }
      else travelChanged(false);
      return;
    }
    travel.current = { route, elapsed: 0, duration: clamp(distance * 300 + turn * 250, 1100, 4800), start: { ...pose.current }, shot };
    travelChanged(true);
  // Callbacks are refs so parent state changes cannot restart a walk.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneIndex, choiceId, completed, reducedMotion, scriptVersion, eventKey]);

  useLayoutEffect(() => {
    if (skip.current === skipToken) return; skip.current = skipToken;
    const active = travel.current; if (!active && !incident.current && !incidentQueued.current) return;
    if (active) { const shot = active.shot; pose.current = { ...shot.position, angle: Math.atan2(shot.look.y - shot.position.y, shot.look.x - shot.position.x), pitch: shot.pitch, eye: shot.eye, focus: shot.focus }; }
    if (incident.current || incidentQueued.current) shotFallen.current = true;
    incident.current = null; incidentQueued.current = false;
    travel.current = null; dirty.current = true; travelChanged(false); wake.current();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipToken]);

  useEffect(() => { lastFrame.current = performance.now(); dirty.current = true; wake.current(); }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); if (!ctx) return;
    art.current = makeArt();
    let disposed = false, frame = 0;
    const doctorImage = new Image();
    doctorImage.onload = () => {
      if (disposed || !art.current) return;
      art.current.textures.doctor = doctorImage;
      dirty.current = true; wake.current();
    };
    doctorImage.src = '/assets/portraits/dr-sen-pixel.png';
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      canvas.width = clamp(Math.round(bounds.width / 2), 256, 640);
      canvas.height = clamp(Math.round(canvas.width * bounds.height / Math.max(1, bounds.width)), 144, 900);
      ctx.imageSmoothingEnabled = false; dirty.current = true; wake.current();
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const preference = () => {
      reduced.current = reducedMotion ?? media.matches;
      if (reduced.current && travel.current) {
        const shot = travel.current.shot;
        pose.current = { ...shot.position, angle: Math.atan2(shot.look.y - shot.position.y, shot.look.x - shot.position.x), pitch: shot.pitch, eye: shot.eye, focus: shot.focus };
        travel.current = null;
        if (incidentQueued.current) { incident.current = { elapsed: 0, sounded: false }; incidentQueued.current = false; }
        else if (!incident.current) travelChanged(false);
        dirty.current = true; wake.current();
      }
    };
    media.addEventListener('change', preference);
    const visibility = () => { lastFrame.current = performance.now(); if (!document.hidden) { dirty.current = true; wake.current(); } };
    document.addEventListener('visibilitychange', visibility);
    const tick = (time: number) => {
      frame = 0;
      if (disposed) return;
      const elapsed = Math.min(50, Math.max(0, time - lastFrame.current)); lastFrame.current = time;
      if (!document.hidden && !pausedRef.current) {
        const active = travel.current;
        if (active) {
          active.elapsed += elapsed;
          const progress = clamp(active.elapsed / active.duration, 0, 1), amount = openingEase(Math.min(1, progress / .88));
          const distance = active.route.distance * amount, position = sampleOpeningRoute(active.route, distance);
          const lookahead = sampleOpeningRoute(active.route, Math.min(active.route.distance, distance + .7));
          if (active.route.distance > .2 && progress > .06 && progress < .83 && time - lastStep.current > 450) { playSfx('step'); lastStep.current = time; }
          pose.current.x = position.x; pose.current.y = position.y;
          const finalAngle = Math.atan2(active.shot.look.y - active.shot.position.y, active.shot.look.x - active.shot.position.x);
          const tangent = active.route.distance > 2 && distance < active.route.distance - .05 ? Math.atan2(lookahead.y - position.y, lookahead.x - position.x) : finalAngle;
          const turnBlend = openingEase((progress - .48) / .48), walkAngle = tangent + openingAngleDelta(tangent, finalAngle) * turnBlend;
          pose.current.angle += openingAngleDelta(pose.current.angle, walkAngle) * (1 - Math.exp(-elapsed / 135));
          pose.current.pitch = active.start.pitch + (active.shot.pitch - active.start.pitch) * ease(progress);
          pose.current.eye = (active.start.eye ?? .79) + ((active.shot.eye ?? .79) - (active.start.eye ?? .79)) * ease(progress);
          if (active.shot.focus) {
            const sameTarget = active.start.focus?.x === active.shot.focus.x && active.start.focus?.y === active.shot.focus.y && active.start.focus?.height === active.shot.focus.height;
            pose.current.focus = active.shot.focus;
            // Keep established doctor framing during a short approach instead of briefly dropping it.
            pose.current.focusAmount = sameTarget ? 1 : ease(clamp((progress - .55) / .45, 0, 1));
          }
          else if (active.start.focus) { pose.current.focus = active.start.focus; pose.current.focusAmount = 1 - ease(clamp(progress / .35, 0, 1)); }
          else { pose.current.focus = undefined; pose.current.focusAmount = undefined; }
          if (progress >= 1) {
            pose.current = { ...active.shot.position, angle: finalAngle, pitch: active.shot.pitch, eye: active.shot.eye, focus: active.shot.focus }; travel.current = null;
            if (incidentQueued.current) { incident.current = { elapsed: 0, sounded: false }; incidentQueued.current = false; }
            else travelChanged(false);
          }
          dirty.current = true;
        }
        if (incident.current && !travel.current) {
          incident.current.elapsed += elapsed;
          const cue = openingIncidentFrame(incident.current.elapsed, reduced.current);
          if (!incident.current.sounded && incident.current.elapsed >= cue.fireAt) { incident.current.sounded = true; shotFallen.current = true; playSfx('shot'); }
          if (cue.finished) { incident.current = null; shotFallen.current = true; travelChanged(false); }
          dirty.current = true;
        }
      }
      if (!document.hidden && (time - lastRender.current >= 1000 / 30 || (!travel.current && !incident.current)) && dirty.current) {
        const viewPose = incident.current ? openingIncidentPose(pose.current, incident.current.elapsed, reduced.current) : pose.current;
        renderWorld(ctx, canvas.width, canvas.height, viewPose, art.current!, scene.current, time, !!travel.current && !pausedRef.current, reduced.current, buffers.current, incident.current?.elapsed ?? null, shotFallen.current); dirty.current = false;
        // Retain fractional frame time, avoiding alternating 33/50ms gaps on 60Hz displays.
        lastRender.current = time - ((time - lastRender.current) % (1000 / 30));
      }
      if (!document.hidden && !pausedRef.current && (travel.current || incident.current)) frame = requestAnimationFrame(tick);
    };
    wake.current = () => { if (!disposed && !frame) frame = requestAnimationFrame(tick); };
    wake.current();
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); media.removeEventListener('change', preference); document.removeEventListener('visibilitychange', visibility); doctorImage.onload = null; travel.current = null; incident.current = null; art.current = null; buffers.current = {}; wake.current = () => {}; };
  // The canvas owns one renderer and observer for its whole mounted lifetime.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className="opening-world-canvas" aria-label="First-person view of Aster laboratory. Movement follows story choices automatically." role="img" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: 'pixelated', display: 'block', background: '#1c3038' }} />;
}
