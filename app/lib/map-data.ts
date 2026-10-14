export type MapPosition = { x: number; y: number };
export type MapTarget = { type: "evidence" | "suspect" | "officer"; id: string; label: string };
export const MAP_WIDTH = 34;
export const MAP_HEIGHT = 21;
export const DEFAULT_POSITION: MapPosition = { x: 16, y: 10 };

export const furniture = [
  { x: 1, y: 3, w: 3, h: 2, kind: "bench" },
  { x: 7, y: 3, w: 3, h: 2, kind: "desk" },
  { x: 6, y: 6, w: 2, h: 1, kind: "body" },
  { x: 13, y: 3, w: 3, h: 2, kind: "lab" },
  { x: 18, y: 3, w: 3, h: 2, kind: "lab" },
  { x: 15, y: 6, w: 3, h: 1, kind: "bench" },
  { x: 24, y: 3, w: 2, h: 4, kind: "server" },
  { x: 29, y: 3, w: 2, h: 4, kind: "server" },
  { x: 2, y: 15, w: 4, h: 1, kind: "sofa" },
  { x: 2, y: 17, w: 1, h: 2, kind: "sofa" },
  { x: 5, y: 17, w: 2, h: 1, kind: "coffee" },
  { x: 11, y: 15, w: 2, h: 1, kind: "vending" },
  { x: 19, y: 15, w: 4, h: 2, kind: "desk" },
  { x: 28, y: 14, w: 3, h: 1, kind: "cabinet" },
  { x: 28, y: 18, w: 3, h: 1, kind: "cabinet" },
  { x: 1, y: 7, w: 1, h: 1, kind: "plant" },
  { x: 20, y: 7, w: 1, h: 1, kind: "plant" },
  { x: 14, y: 18, w: 1, h: 1, kind: "plant" },
  { x: 18, y: 18, w: 1, h: 1, kind: "plant" },
];

/** A # is a collision tile; a . is walkable. The same grid may be checked by the server. */
export const COLLISION_GRID: string[] = Array.from({ length: MAP_HEIGHT }, (_, y) =>
  Array.from({ length: MAP_WIDTH }, (_, x) => {
    const boundary = x === 0 || y === 0 || x === MAP_WIDTH - 1 || y === MAP_HEIGHT - 1;
    const upperDividers = y < 9 && (x === 11 || x === 22);
    const upperWall = y === 9 && ![5, 6, 16, 17, 27, 28].includes(x);
    const lowerWall = y === 12 && ![6, 7, 24, 25].includes(x);
    const lowerDivider = y > 12 && x === 16;
    const object = furniture.some((f) => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h);
    return boundary || upperDividers || upperWall || lowerWall || lowerDivider || object ? "#" : ".";
  }).join(""),
);
export const WALKABLE_GRID = COLLISION_GRID.map((row) => row.split("").map((cell) => cell === "."));
export function isValidPosition(p: MapPosition): boolean {
  return Number.isInteger(p.x) && Number.isInteger(p.y) && COLLISION_GRID[p.y]?.[p.x] === ".";
}

export const EVIDENCE_LOCATIONS = [
  { id: "watch", label: "Broken smartwatch", x: 8, y: 6 },
  { id: "flask", label: "Laboratory flask", x: 14, y: 3 },
  { id: "logs", label: "Access logs", x: 25, y: 5 },
  { id: "camera", label: "Camera fragment", x: 30, y: 10 },
  { id: "note", label: "Folded note", x: 21, y: 15 },
] as const;

export const suspectSpots = [{ x: 3, y: 6 }, { x: 19, y: 7 }, { x: 10, y: 17 }, { x: 26, y: 17 }, { x: 28, y: 7 }, { x: 13, y: 6 }];
export const officerSpot = { x: 12, y: 10 };

export function canWalk(x: number, y: number): boolean { return isValidPosition({ x, y }); }

export type PositionedMapTarget = MapTarget & MapPosition;
export type MapSuspect = { id: string; name: string; x?: number; y?: number };
/** Preserve current participant IDs and server coordinates when the roster changes. */
export function getMapTargets(suspects: MapSuspect[]): PositionedMapTarget[] {
  return [
    ...EVIDENCE_LOCATIONS.map((e) => ({ ...e, type: 'evidence' as const })),
    ...suspects.slice(0, suspectSpots.length).map((s, i) => ({
      ...(typeof s.x === 'number' && typeof s.y === 'number' && canWalk(s.x, s.y) ? { x: s.x, y: s.y } : suspectSpots[i]),
      type: 'suspect' as const, id: s.id, label: s.name,
    })),
    { ...officerSpot, type: 'officer' as const, id: 'officer', label: 'Officer on duty' },
  ];
}
