import type { MapPosition } from './map-data';

export const MAP_STEP_MS = 140;

/** Reconstruct a legal display route between sparse shared snapshots. No writes. */
export function remoteMapRoute(from: MapPosition, to: MapPosition, walkable: (p: MapPosition) => boolean, occupied: MapPosition[] = []): MapPosition[] | null {
  if (!walkable(from) || !walkable(to)) return null;
  const key = (p: MapPosition) => `${p.x},${p.y}`;
  const blocked = new Set(occupied.map(key));
  if (blocked.has(key(to))) return null;
  const queue = [from], previous = new Map<string, MapPosition | null>([[key(from), null]]);
  for (let i = 0; i < queue.length && i < 2048; i++) {
    const current = queue[i];
    if (current.x === to.x && current.y === to.y) {
      const route: MapPosition[] = [];
      let point = current;
      while (previous.get(key(point))) { route.push({ ...point }); point = previous.get(key(point))!; }
      return route.reverse();
    }
    for (const [x, y] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const next = { x: current.x + x, y: current.y + y }, id = key(next);
      if (previous.has(id) || blocked.has(id) || !walkable(next)) continue;
      previous.set(id, current); queue.push(next);
    }
  }
  return null;
}

export function interpolateMapStep(from: MapPosition, to: MapPosition, elapsed: number): MapPosition {
  const progress = Math.max(0, Math.min(1, elapsed / MAP_STEP_MS));
  return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
}

/** Carry only this frame's remainder; a network pause must not cause a catch-up jump. */
export function nextMapStepStart(previousStart: number, time: number, frameElapsed: number): number {
  const boundary = previousStart + MAP_STEP_MS;
  const carryWindow = Math.min(50, Math.max(0, frameElapsed));
  return boundary <= time && boundary >= time - carryWindow - .001 ? boundary : time;
}

/** Equivalent follow-camera response at 30, 60, and 120 Hz. */
export function followMapCamera(current: number, target: number, elapsed: number): number {
  const amount = 1 - Math.exp(-Math.min(100, Math.max(0, elapsed)) / 85);
  return current + (target - current) * amount;
}
