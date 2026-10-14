"use client";
import { audienceFrameDelay } from "../lib/audience-runtime";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { playSfx } from "../lib/audio";
import { drawFallenDoctor } from "../lib/pixel-doctor";
import { MAP_STEP_MS, interpolateMapStep, nextMapStepStart, followMapCamera, remoteMapRoute } from "../lib/map-motion";
export { interpolateMapStep } from "../lib/map-motion";

import { DEFAULT_POSITION, MAP_WIDTH, MAP_HEIGHT, furniture, isValidPosition, getMapTargets, type MapPosition, type MapTarget, type MapSuspect } from "../lib/map-data";
export { DEFAULT_POSITION, MAP_WIDTH, MAP_HEIGHT, COLLISION_GRID, WALKABLE_GRID, EVIDENCE_LOCATIONS, isValidPosition, canWalk } from "../lib/map-data";
export type { MapPosition, MapTarget } from "../lib/map-data";
const TILE = 24;
const WIDTH = MAP_WIDTH * TILE;
const HEIGHT = MAP_HEIGHT * TILE;

type PositionedTarget = MapTarget & MapPosition;
type CrimeMapProps = {
  position: MapPosition;
  onMove: (position: MapPosition) => boolean | void;
  movementPending?: boolean;
  onInteract: (target: MapTarget) => void;
  canControl: boolean;
  suspects: MapSuspect[];
  discovered: string[];
  immersive?: boolean;
  height?: number | string;
  navigationTarget?: { id: string; nonce: number };
};

function roomAt(p: MapPosition): string {
  if (p.y <= 9) return p.x < 11 ? "Crime Scene" : p.x < 22 ? "Main Lab" : "Server Room";
  if (p.y >= 12) return p.x < 16 ? "Lounge" : "Admin Office";
  return "Central Corridor";
}
function distance(a: MapPosition, b: MapPosition) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function pathTo(from: MapPosition, to: MapPosition, blocked: MapPosition[], adjacent: boolean): MapPosition[] {
  const queue: Array<{ p: MapPosition; path: MapPosition[] }> = [{ p: from, path: [] }];
  const seen = new Set([`${from.x},${from.y}`]);
  for (let i = 0; i < queue.length; i++) {
    const { p, path } = queue[i];
    if (distance(p, to) <= (adjacent ? 1 : 0)) return path;
    for (const d of [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]) {
      const next = { x: p.x + d.x, y: p.y + d.y };
      const key = `${next.x},${next.y}`;
      if (seen.has(key) || !isValidPosition(next) || blocked.some((b) => b.x === next.x && b.y === next.y)) continue;
      seen.add(key); queue.push({ p: next, path: [...path, next] });
    }
  }
  return [];
}

export default function CrimeMap(props: CrimeMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wakeFrame = useRef<(() => void) | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const projection = useRef({ x: 0, y: 0, scale: 1, left: 0, top: 0 });
  const [cameraMode, setCameraMode] = useState<"follow" | "floor">("follow");
  const cameraModeRef = useRef(cameraMode);
  const state = useRef(props);
  const initialPosition = isValidPosition(props.position) ? props.position : DEFAULT_POSITION;
  const position = useRef<MapPosition>(initialPosition);
  const displayed = useRef({ ...initialPosition });
  const motion = useRef({ from: { ...initialPosition }, to: { ...initialPosition }, started: 0 });
  const keys = useRef(new Set<string>());
  const route = useRef<MapPosition[]>([]);
  const remoteRoute = useRef<MapPosition[]>([]);
  const hadControl = useRef(props.canControl);
  const routeTarget = useRef<PositionedTarget | null>(null);
  const navigationHandled = useRef<number | null>(null);
  const lastStep = useRef(0);
  const facing = useRef("down");
  const [nearby, setNearby] = useState<PositionedTarget | null>(null);
  const [tip, setTip] = useState("");
  const [currentRoom, setCurrentRoom] = useState(() => roomAt(initialPosition));

  useLayoutEffect(() => { cameraModeRef.current = cameraMode; state.current = props; wakeFrame.current?.(); }, [cameraMode, props]);
  const positionX = props.position.x, positionY = props.position.y;
  useEffect(() => {
    const next = { x: positionX, y: positionY };
    const gainedControl = props.canControl && !hadControl.current;
    hadControl.current = props.canControl;
    if (!isValidPosition(next)) return;
    if (!props.canControl) {
      // Finish the current adjacent segment, then replace the unsent visual
      // route with the newest shared destination. Never cut through a wall.
      const occupied = getMapTargets(state.current.suspects).filter(target => target.type !== 'evidence');
      const path = remoteMapRoute(position.current, next, isValidPosition, occupied);
      remoteRoute.current = path ?? [];
      route.current = []; routeTarget.current = null;
      if (path !== null) { wakeFrame.current?.(); return; }
      // A reset/disconnected region has no legal route; adopt that snapshot
      // without inventing movement across blocked cells.
    } else remoteRoute.current = [];
    if (gainedControl || distance(next, position.current) > 0) {
      route.current = []; routeTarget.current = null;
      if (gainedControl || !props.canControl || distance(next, position.current) > 1) displayed.current = { ...next };
      motion.current = { from: { ...displayed.current }, to: next, started: performance.now() };
      lastStep.current = motion.current.started - (gainedControl ? MAP_STEP_MS : 0);
      position.current = next;
    }
  }, [positionX, positionY, props.canControl]);
  useEffect(() => {
    if (!props.canControl) { keys.current.clear(); route.current = []; routeTarget.current = null; }
  }, [props.canControl]);
  useEffect(() => {
    if (!tip) return;
    const timer = window.setTimeout(() => setTip(""), 3500);
    return () => window.clearTimeout(timer);
  }, [tip]);

  function targets(): PositionedTarget[] { return getMapTargets(state.current.suspects); }
  function interact(target?: PositionedTarget | null) {
    if (!state.current.canControl) return;
    const candidate = target ?? targets().find((t) => distance(t, position.current) <= 1);
    if (candidate && distance(candidate, position.current) <= 1) {
      keys.current.clear(); route.current = []; routeTarget.current = null;
      state.current.onInteract({ type: candidate.type, id: candidate.id, label: candidate.label });
    } else setTip("Move next to a glowing clue or a person to interact.");
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pressedKeys = keys.current;
    const screenContext = canvas.getContext("2d");
    const worldCanvas = document.createElement("canvas");
    worldCanvas.width = WIDTH; worldCanvas.height = HEIGHT;
    const worldContext = worldCanvas.getContext("2d");
    if (!screenContext || !worldContext) return;
    const context = worldContext;
    const screen = screenContext;
    const viewport = { width: WIDTH, height: HEIGHT, ratio: 1 };
    const camera = { x: 0, y: 0, ready: false };
    type LabelKind = "room" | "subtitle" | "direction" | "npc" | "clue" | "symbol";
    const textLabels: Array<{ text: string; x: number; y: number; size: number; color: string; align: CanvasTextAlign; kind: LabelKind }> = [];
    let animation = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let active = true;
    let previousFrame = 0;
    let previousDraw = 0;
    let lastNearby = "";
    const fitCanvas = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const bounds = viewportRef.current?.getBoundingClientRect();
      viewport.width = Math.max(1, bounds?.width || WIDTH);
      viewport.height = Math.max(1, bounds?.height || HEIGHT);
      viewport.ratio = ratio;
      canvas.width = Math.round(viewport.width * ratio);
      canvas.height = Math.round(viewport.height * ratio);
      screen.setTransform(ratio, 0, 0, ratio, 0, 0);
      screen.imageSmoothingEnabled = false;
      context.imageSmoothingEnabled = false;
      wakeFrame.current?.();
    };
    fitCanvas();
    window.addEventListener("resize", fitCanvas);
    const resizeObserver = new ResizeObserver(fitCanvas);
    if (viewportRef.current) resizeObserver.observe(viewportRef.current);

    const textInput = (target: EventTarget | null) => target instanceof HTMLElement && (!!target.closest("input,textarea,select,button,a,[contenteditable=true],[role=dialog]"));
    const keyDown = (event: KeyboardEvent) => {
      if (!state.current.canControl || textInput(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
        event.preventDefault(); route.current = []; routeTarget.current = null; keys.current.add(key);
      }
      if ((key === "e" || key === " ") && !event.repeat) { event.preventDefault(); interact(); }
    };
    const keyUp = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    const blur = () => { keys.current.clear(); };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);

    function rect(x: number, y: number, w: number, h: number, color: string) {
      context.fillStyle = color; context.fillRect(Math.round(x), Math.round(y), w, h);
    }
    function label(text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "center", kind: LabelKind = "direction") {
      textLabels.push({ text, x, y, size, color, align, kind });
    }
    function drawReadableLabels() {
      const view = projection.current;
      const closeCamera = !!state.current.immersive && cameraModeRef.current === "follow";
      const occupied: Array<{ x: number; y: number; w: number; h: number }> = [];
      const characterBounds = [displayed.current, ...targets().filter(target => target.type !== "evidence")].map(character => ({
        x: ((character.x * TILE + 2) - view.x) * view.scale + view.left,
        y: ((character.y * TILE - 8) - view.y) * view.scale + view.top,
        w: 22 * view.scale, h: 36 * view.scale,
      }));
      const priority: Record<LabelKind, number> = { symbol: 6, clue: 5, npc: 4, room: 3, direction: 2, subtitle: 1 };
      // Text is painted at the final screen resolution, after scaling and scan lines.
      // The scene remains pixel art; glyphs never pass through the low-resolution world bitmap.
      screen.textBaseline = "alphabetic";
      for (const item of [...textLabels].sort((a, b) => priority[b.kind] - priority[a.kind])) {
        if (!closeCamera && (item.kind === "subtitle" || item.kind === "direction")) continue;
        if (!closeCamera && view.scale < .58 && item.kind === "npc") continue;
        const anchorX = (item.x - view.x) * view.scale + view.left;
        const anchorY = (item.y - view.y) * view.scale + view.top;
        if (anchorX < -8 || anchorX > viewport.width + 8 || anchorY < 5 || anchorY > viewport.height - 4) continue;
        const minimum = item.kind === "room" || item.kind === "clue" ? 12 : item.kind === "npc" ? 12 : 11;
        const maximum = item.kind === "room" ? 20 : item.kind === "symbol" ? 23 : item.kind === "npc" ? 16 : 13;
        const fontSize = Math.max(minimum, Math.min(maximum, Math.round(item.size * view.scale)));
        screen.font = `${item.kind === "subtitle" ? 500 : 600} ${fontSize}px Consolas, 'Courier New', monospace`;
        const width = Math.ceil(screen.measureText(item.text).width);
        const padding = item.kind === "symbol" ? 0 : 5;
        const left = Math.round(Math.max(4, Math.min(viewport.width - width - padding * 2 - 4, anchorX - width / 2 - padding)));
        const baseline = Math.round(anchorY);
        const bounds = { x: left, y: baseline - fontSize - 3, w: width + padding * 2, h: fontSize + 7 };
        if (characterBounds.some(b => bounds.x < b.x + b.w && bounds.x + bounds.w > b.x && bounds.y < b.y + b.h && bounds.y + bounds.h > b.y)) continue;
        if (item.kind !== "symbol" && occupied.some(b => bounds.x < b.x + b.w + 3 && bounds.x + bounds.w + 3 > b.x && bounds.y < b.y + b.h + 2 && bounds.y + bounds.h + 2 > b.y)) continue;
        if (item.kind !== "symbol") {
          screen.fillStyle = item.kind === "room" ? "#8caaa1" : "#18312deb";
          screen.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
          if (item.kind === "room") { screen.fillStyle = "#18312deb"; screen.fillRect(bounds.x + 1, bounds.y + 1, bounds.w - 2, bounds.h - 2); }
        }
        screen.textAlign = "left";
        screen.fillStyle = item.color;
        screen.fillText(item.text, left + padding, baseline);
        occupied.push(bounds);
      }
    }
    function sprite(x: number, y: number, role: string, time: number, moving = false, variant = 0) {
      const px = Math.round(x * TILE), py = Math.round(y * TILE);
      const n = Math.max(0, variant) % 6;
      const detective = role === "detective", officer = role === "officer";
      const direction = detective ? facing.current : "down";
      const bob = moving ? Math.round(Math.sin(time / 75)) : 0;
      const outline = "#111b27";
      const coats = [
        ["#dae1c3", "#ffffdf", "#8b9d8e"], ["#5878a1", "#91acc7", "#344760"],
        ["#b86f8b", "#eca9ba", "#75455f"], ["#889b55", "#bdce80", "#50633c"],
        ["#b36d43", "#ecaa72", "#754632"], ["#438b89", "#83c4b5", "#28595f"],
      ];
      const coat = detective ? ["#c59748", "#f2cf78", "#805731"] : officer ? ["#4f7199", "#86a6c4", "#2c4365"] : coats[n];
      const hair = [["#795044", "#b47750"], ["#253143", "#536072"], ["#47334b", "#79546a"], ["#674635", "#98704a"], ["#804a34", "#ba7850"], ["#a1874d", "#dac17c"]][n];
      const skin = n % 3 === 1 && !detective && !officer ? ["#b98362", "#d6a584", "#7f5344"] : ["#d6a47c", "#f1c99d", "#9c6a52"];
      const part = (dx: number, dy: number, w: number, h: number, color: string) => rect(px + dx, py + dy + bob, w, h, color);
      // Ground shadow remains fixed while the lit body bobs one pixel during a step.
      rect(px + 5, py + 23, 16, 4, "#0b1924aa"); rect(px + 3, py + 24, 20, 2, "#0b192455");
      // Separate legs, hard boot silhouettes, and alternating feet keep walking legible.
      const leftLift = moving && Math.sin(time / 75) > 0 ? 2 : 0;
      const rightLift = moving && Math.sin(time / 75) < 0 ? 2 : 0;
      rect(px + 7, py + 19 - leftLift, 5, 7, outline); rect(px + 14, py + 19 - rightLift, 5, 7, outline);
      rect(px + 8, py + 20 - leftLift, 3, 3, "#46515c"); rect(px + 15, py + 20 - rightLift, 3, 3, "#303b4c");
      rect(px + 6, py + 24 - leftLift, 6, 2, "#172232"); rect(px + 14, py + 24 - rightLift, 7, 2, "#111b27");
      rect(px + 7, py + 24 - leftLift, 4, 1, "#74828a"); rect(px + 15, py + 24 - rightLift, 4, 1, "#536773");
      // Near-black outline plus three flat tones per material creates crisp cel shading.
      part(6, 10, 14, 12, outline); part(3, 12, 4, 9, outline); part(19, 12, 4, 9, outline);
      part(7, 11, 12, 9, coat[0]); part(7, 11, 4, 7, coat[1]); part(16, 12, 3, 9, coat[2]);
      part(4, 13, 2, 6, coat[0]); part(4, 13, 1, 4, coat[1]); part(20, 13, 2, 6, coat[2]);
      part(4, 19, 2, 2, skin[0]); part(20, 19, 2, 2, skin[2]);
      part(9, 10, 7, 3, skin[2]); part(10, 10, 4, 2, skin[0]);
      if (direction !== "up") {
        part(10, 12, 5, 7, detective ? "#64482d" : "#263d4c");
        part(9, 11, 3, 3, coat[1]); part(14, 11, 3, 3, coat[1]);
        part(12, 13, 2, 3, detective ? "#e6d8ad" : "#e3e6cc");
        part(12, 16, 2, 3, officer ? "#bba956" : "#283b49");
      } else { part(11, 11, 1, 8, coat[2]); part(8, 14, 8, 1, coat[1]); }
      part(7, 20, 12, 1, coat[2]);
      if (detective) { part(8, 17, 3, 1, "#805b30"); part(15, 17, 2, 1, "#5b402b"); part(11, 19, 3, 2, "#d5b05a"); }
      if (officer) { part(8, 13, 3, 4, "#e7c35a"); part(9, 13, 1, 2, "#fff1b0"); part(16, 15, 2, 3, "#253b54"); }
      if (!detective && !officer && (n === 0 || n === 2)) { part(8, 16, 3, 3, coat[2]); part(9, 16, 1, 2, "#e9ffff"); }
      // Hair silhouettes give each suspect a distinct identity at a glance.
      const longHair = !detective && !officer && [0, 2, 4].includes(n);
      if (longHair) { part(5, -2, 15, 13, outline); part(6, -1, 3, n === 4 ? 14 : 11, hair[0]); part(17, -1, 3, n === 4 ? 14 : 11, hair[0]); part(6, 0, 1, 8, hair[1]); }
      part(7, -3, 12, 14, outline); part(6, 3, 14, 5, outline);
      part(8, 0, 10, 10, skin[0]); part(8, 0, 7, 3, skin[1]); part(16, 2, 2, 8, skin[2]);
      part(7, 4, 1, 3, skin[0]); part(18, 4, 1, 3, skin[2]); part(9, 9, 7, 1, skin[2]);
      if (detective || officer) {
        part(7, -5, 12, 7, outline); part(4, 1, 18, 4, outline);
        part(8, -4, 10, 5, detective ? "#be9148" : "#4b739d");
        part(8, -4, 7, 2, detective ? "#f0ce7c" : "#8aadd0"); part(16, -2, 2, 3, detective ? "#80542c" : "#2c466e");
        part(8, 0, 10, 2, detective ? "#5d432e" : "#223855");
        part(5, 2, 16, 2, detective ? "#d3ab61" : "#476a91"); part(5, 2, 13, 1, detective ? "#f4d990" : "#89abc9");
        if (officer) part(12, -2, 3, 3, "#f1d379");
      } else {
        part(7, -4, 12, 5, outline); part(8, -3, 10, 4, hair[0]); part(8, -3, 7, 1, hair[1]);
        part(8, 0, n === 1 ? 4 : 3, 2, hair[0]); part(15, 0, 3, n === 2 ? 5 : 3, hair[0]);
        if (n === 0) { part(19, 0, 3, 8, outline); part(20, 1, 2, 6, hair[0]); }
        if (n === 5) { part(8, -5, 3, 2, hair[0]); part(13, -5, 4, 2, hair[0]); part(9, -4, 2, 1, hair[1]); }
      }
      if (direction === "up") { part(8, 4, 10, 5, detective || officer ? "#604635" : hair[0]); part(9, 4, 6, 1, detective || officer ? "#8d6942" : hair[1]); }
      else {
        if (direction !== "right") { part(9, 5, 3, 2, "#f6eed3"); part(10, 5, 1, 2, outline); }
        if (direction !== "left") { part(14, 5, 3, 2, "#e7dbbb"); part(15, 5, 1, 2, outline); }
        part(12, 7, 1, 1, skin[2]); part(11, 9, 4, 1, "#704c43");
        if (!detective && !officer && [1, 3].includes(n)) { part(8, 4, 5, 1, outline); part(14, 4, 4, 1, outline); part(8, 6, 5, 1, outline); part(14, 6, 4, 1, outline); part(12, 5, 2, 1, outline); }
      }
    }
    function object(f: (typeof furniture)[number], time: number) {
      const x = f.x * TILE, y = f.y * TILE, w = f.w * TILE, h = f.h * TILE;
      rect(x + 4, y + 7, w, h - 2, "#071c21");
      if (f.kind === "plant") {
        rect(x + 7, y + 13, 13, 10, "#476273"); rect(x + 5, y + 12, 17, 4, "#789398");
        rect(x + 9, y + 2, 8, 15, "#31877e"); rect(x + 3, y + 5, 18, 7, "#3f9c89");
        rect(x + 8, y, 7, 6, "#68b49c"); rect(x + 16, y + 7, 7, 7, "#2c6d69");
      } else if (f.kind === "server") {
        rect(x + 3, y + 2, w - 6, h - 3, "#172a35"); rect(x + 3, y + 2, w - 6, 4, "#456779");
        rect(x + 2, y + 8, 3, h - 10, "#0b1620");
        for (let j = 0; j < 5; j++) {
          rect(x + 8, y + 11 + j * 16, w - 15, 12, "#223b48");
          rect(x + 12, y + 14 + j * 16, 12, 2, "#466375"); rect(x + 12, y + 18 + j * 16, 12, 2, "#304f60");
          rect(x + w - 15, y + 14 + j * 16, 3, 3, (Math.floor(time / 750) + j) % 3 ? "#46b7b3" : "#a9e5cf");
        }
      } else if (f.kind === "body") {
        drawFallenDoctor(context, x, y + 1, .5);
      } else if (f.kind === "sofa") {
        rect(x + 1, y + 2, w - 2, h - 3, "#305661"); rect(x + 1, y + 2, w - 2, 5, "#4a7880");
        if (w > h) for (let k = 0; k < 4; k++) rect(x + 6 + k * 22, y + 10, 18, 9, "#3e6c76");
        else for (let k = 0; k < 2; k++) rect(x + 6, y + 8 + k * 19, 13, 15, "#3e6c76");
      } else if (f.kind === "coffee") {
        rect(x + 3, y + 4, w - 6, h - 5, "#677777"); rect(x + 3, y + 4, w - 6, 3, "#99a39c");
        rect(x + 10, y + 7, 13, 8, "#9dadab"); rect(x + 29, y + 9, 6, 6, "#dbd4b7");
      } else if (f.kind === "vending") {
        rect(x + 3, y - 14, w - 6, h + 13, "#285464"); rect(x + 5, y - 12, w - 10, 4, "#568696");
        rect(x + 9, y - 5, 21, 20, "#112d39"); rect(x + 35, y, 4, 8, "#76bfba");
        for (let k = 0; k < 3; k++) { rect(x + 12 + k * 6, y - 1, 4, 5, "#bcba80"); rect(x + 12 + k * 6, y + 7, 4, 5, "#6b9fac"); }
        rect(x + 14, y + 18, 16, 3, "#071b21");
      } else if (f.kind === "cabinet") {
        rect(x + 2, y + 2, w - 4, h - 2, "#3d5963"); rect(x + 2, y + 2, w - 4, 4, "#729198");
        for (let k = 0; k < 3; k++) { rect(x + 6 + k * 23, y + 8, 18, 12, "#4f6b74"); rect(x + 11 + k * 23, y + 11, 7, 2, "#a5bbbb"); }
      } else {
        rect(x + 2, y + 3, w - 4, h - 4, "#3e5961"); rect(x + 2, y + 3, w - 4, 4, "#80999c");
        rect(x + 4, y + h - 9, w - 8, 6, "#233d47");
        if (f.kind === "desk") {
          rect(x + 11, y + 5, 25, 18, "#0c2630"); rect(x + 14, y + 8, 19, 11, "#2b667a");
          rect(x + 16, y + 10, 11, 2, "#81bac0"); rect(x + 21, y + 23, 5, 5, "#1e353f");
          rect(x + 13, y + 31, 22, 5, "#809596"); rect(x + w - 25, y + 12, 14, 19, "#a5b7b6");
          rect(x + w - 22, y + 16, 8, 2, "#6c858a");
        } else if (f.kind === "lab") {
          rect(x + 9, y + 10, 14, 18, "#bbc6bc"); rect(x + 12, y + 7, 7, 7, "#769caa");
          rect(x + 12, y + 18, 8, 9, "#45a5a4"); rect(x + 35, y + 10, 4, 16, "#99c4c6");
          rect(x + 33, y + 24, 8, 4, "#4bc2b8"); rect(x + 48, y + 9, 11, 18, "#284958");
          rect(x + 50, y + 6, 7, 10, "#98b5b6"); rect(x + 48, y + 29, 15, 5, "#152f3a");
        } else {
          for (let k = 0; k < 3; k++) { rect(x + 9 + k * 19, y + 9, 11, 7, "#68898c"); rect(x + 11 + k * 19, y + 10, 7, 2, "#8ab1b2"); }
        }
      }
    }
    function draw(time: number, elapsed: number) {
      textLabels.length = 0;
      context.clearRect(0, 0, WIDTH, HEIGHT);
      rect(0, 0, WIDTH, HEIGHT, "#071a21");
      for (let y = 1; y < MAP_HEIGHT - 1; y++) for (let x = 1; x < MAP_WIDTH - 1; x++) {
        const corridor = y === 10 || y === 11;
        const colors = corridor ? ["#344b4e", "#384f51"] : y < 10 ? x < 11 ? ["#465e60", "#4a6463"] : x < 22 ? ["#608377", "#688b7c"] : ["#354a58", "#3b5060"] : x < 16 ? ["#79684d", "#816e50"] : ["#5b715f", "#637864"];
        const floor = colors[(x + y) % 2];
        rect(x * TILE, y * TILE, TILE, TILE, floor);
        rect(x * TILE, y * TILE, TILE, 1, "#243a3c55");
        rect(x * TILE, y * TILE, 1, TILE, "#243a3c44");
        if ((x * 17 + y * 13) % 23 === 0) rect(x * TILE + 5, y * TILE + 7, 2, 2, "#2d5158");
      }
      // A muted rug gives the break room a different material from the laboratory.
      rect(3 * TILE, 16 * TILE + 9, 6 * TILE, 3 * TILE - 12, "#a28a61");
      context.strokeStyle = "#c3ac77"; context.lineWidth = 2; context.strokeRect(3 * TILE + 5, 16 * TILE + 14, 6 * TILE - 10, 3 * TILE - 22);
      for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
        const wall = x === 0 || y === 0 || x === MAP_WIDTH - 1 || y === MAP_HEIGHT - 1 || (y < 9 && (x === 11 || x === 22)) || (y === 9 && ![5, 6, 16, 17, 27, 28].includes(x)) || (y === 12 && ![6, 7, 24, 25].includes(x)) || (y > 12 && x === 16);
        if (!wall) continue;
        rect(x * TILE, y * TILE, TILE, TILE, "#0a212b");
        rect(x * TILE, y * TILE, TILE, 3, "#557b87");
        rect(x * TILE, y * TILE + 3, TILE, 5, "#284c5b");
        rect(x * TILE, y * TILE + 20, TILE, 4, "#061821");
        rect(x * TILE + 2, y * TILE + 11, 19, 1, "#36515b");
        rect(x * TILE + ((x + y) % 2 ? 8 : 16), y * TILE + 12, 1, 7, "#1f3943");
      }
      // Doors and threshold lights make every connection legible.
      for (const door of [{ x: 5, y: 9 }, { x: 16, y: 9 }, { x: 27, y: 9 }, { x: 6, y: 12 }, { x: 24, y: 12 }]) {
        rect(door.x * TILE, door.y * TILE + 5, TILE * 2, 15, "#345d65");
        rect(door.x * TILE + 2, door.y * TILE + 6, TILE * 2 - 4, 2, "#66a5ac");
        rect(door.x * TILE, door.y * TILE + 17, TILE * 2, 2, "#163b49");
        rect(door.x * TILE - 3, door.y * TILE + 8, 3, 9, "#79d3ce"); rect((door.x + 2) * TILE, door.y * TILE + 8, 3, 9, "#79d3ce");
      }
      // Low horizontal window strips, wall screens, and cables.
      for (const wx of [2, 6, 13, 18, 25, 29]) {
        rect(wx * TILE, 8, 3 * TILE, 10, "#25536a"); rect(wx * TILE + 2, 10, 3 * TILE - 4, 2, "#6aafb7");
        rect(wx * TILE + TILE, 8, 3, 10, "#0b2632"); rect(wx * TILE + TILE * 2, 8, 3, 10, "#0b2632");
      }
      rect(30 * TILE + 3, 10 * TILE + 5, 18, 7, "#b3c6c6"); rect(30 * TILE + 3, 10 * TILE + 11, 5, 5, "#7a9299");
      rect(30 * TILE + 19, 10 * TILE + 7, 4, 4, "#113743");
      context.strokeStyle = "#17323c"; context.lineWidth = 3;
      context.beginPath(); context.moveTo(26 * TILE, 7 * TILE + 14); context.lineTo(28 * TILE, 7 * TILE + 14); context.lineTo(28 * TILE, 3 * TILE); context.stroke();
      for (const step of route.current) { rect(step.x * TILE + 10, step.y * TILE + 10, 4, 4, "#ebd294a8"); }
      for (const f of furniture) object(f, time);
      // Alternating pixel tape around the protected scene.
      for (let k = 0; k < 12; k++) {
        rect(5 * TILE + k * 10, 5 * TILE + 8, 10, 4, k % 2 ? "#263942" : "#c4b371");
        rect(5 * TILE + k * 10, 7 * TILE + 20, 10, 4, k % 2 ? "#263942" : "#c4b371");
      }
      rect(5 * TILE, 5 * TILE + 4, 3, 13, "#869d9b"); rect(10 * TILE - 3, 5 * TILE + 4, 3, 13, "#869d9b");
      const roomLabels = [
        { title: "CRIME SCENE", x: 5.5, y: 2, color: "#d2b57b", sub: "RESTRICTED AREA" },
        { title: "MAIN LAB", x: 16.5, y: 2, color: "#91c7cb", sub: "RESEARCH & DEVELOPMENT" },
        { title: "SERVER ROOM", x: 27.5, y: 2, color: "#91c7cb", sub: "AUTHORIZED ACCESS" },
        { title: "LOUNGE", x: 8, y: 14, color: "#91c7cb", sub: "PERSONNEL ONLY" },
        { title: "ADMIN OFFICE", x: 24.5, y: 14, color: "#91c7cb", sub: "RECORDS & OPERATIONS" },
      ];
      for (const r of roomLabels) {
        label(r.title, r.x * TILE + 2, r.y * TILE - 3, 10, "#e1eddc", "center", "room");
        label(r.sub, r.x * TILE + 2, r.y * TILE + 8, 5.5, "#c7d9cc", "center", "subtitle");
      }
      label("← CRIME SCENE", 8 * TILE, 10.65 * TILE, 6, "#b9d0be");
      label("LOUNGE ↓", 6.6 * TILE, 11.8 * TILE, 6, "#e2d3a4");
      label("MAIN LAB ↑", 17.5 * TILE, 11.45 * TILE, 6, "#c4dfc9");
      label("ADMIN OFFICE ↓", 24.8 * TILE, 11.8 * TILE, 6, "#d0d6ad");
      label("SERVER ROOM ↑", 29.3 * TILE, 11.4 * TILE, 6, "#bed5df");

      const allTargets = targets();
      for (const t of allTargets) {
        const x = t.x * TILE + 12, y = t.y * TILE + 12;
        if (t.type === "evidence") {
          const found = state.current.discovered.includes(t.id);
          const pulse = 0.45 + (Math.sin(time / 520) + 1) * 0.12;
          context.fillStyle = found ? "rgba(103,191,170,.07)" : `rgba(0,180,216,${pulse * 0.2})`;
          context.beginPath(); context.arc(x, y, 18 + Math.sin(time / 520) * 2, 0, Math.PI * 2); context.fill();
          context.strokeStyle = found ? "#638e8c" : "#90e0ef"; context.lineWidth = 1;
          context.strokeRect(x - 8, y - 8, 16, 16);
          rect(x - 6, y - 6, 12, 12, found ? "#315d64" : "#1c7487");
          // Ground markers are drawn before the detective so they cannot cover a character.
          if (found) {
            context.strokeStyle = "#b9e2cf"; context.lineWidth = 2;
            context.beginPath(); context.moveTo(x - 4, y); context.lineTo(x - 1, y + 3); context.lineTo(x + 5, y - 4); context.stroke();
          } else {
            rect(x - 3, y - 4, 6, 2, "#cef4f7"); rect(x + 1, y - 2, 2, 3, "#cef4f7");
            rect(x - 1, y, 3, 2, "#cef4f7"); rect(x - 1, y + 4, 2, 2, "#cef4f7");
          }
          if (!state.current.immersive && distance(t, position.current) <= 1) {
            label(t.label, x, y - 18, 9, "#d8eeee", "center", "clue");
          }
        } else {
          sprite(t.x, t.y, t.type, time, false, state.current.suspects.findIndex(s => s.id === t.id));
          const shortName = t.type === "officer" ? "OFFICER" : t.label.split(" ").filter((s) => !["Dr.", "Prof."].includes(s))[0].toUpperCase();
          label(shortName, x, y - 28, 7, "#edf0d6", "center", "npc");
          rect(x + 7, y - 8, 8, 7, "#2f6573");
          rect(x + 9, y - 6, 1, 1, "#91d2d5"); rect(x + 12, y - 6, 1, 1, "#91d2d5");
        }
      }
      // A faint light pool around the detective retains the atmosphere without hiding clues.
      const playerX = displayed.current.x * TILE + 12, playerY = displayed.current.y * TILE + 12;
      const glow = context.createRadialGradient(playerX, playerY, 4, playerX, playerY, 74);
      glow.addColorStop(0, "rgba(104,208,210,.12)"); glow.addColorStop(1, "rgba(104,208,210,0)");
      context.fillStyle = glow; context.fillRect(playerX - 74, playerY - 74, 148, 148);
      sprite(displayed.current.x, displayed.current.y, "detective", time, distance(displayed.current, position.current) > 0.001);
      rect(playerX - 8, playerY + 15, 16, 2, "#84e0db");
      // Very subtle scan lines are drawn in world space to preserve sharp pixels.
      context.fillStyle = "rgba(0,10,15,.04)";
      for (let y = 0; y < HEIGHT; y += 4) context.fillRect(0, y, WIDTH, 1);
      const edge = context.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT / 3, WIDTH / 2, HEIGHT / 2, WIDTH / 1.55);
      edge.addColorStop(0, "rgba(0,12,19,0)"); edge.addColorStop(1, "rgba(0,12,19,.20)");
      context.fillStyle = edge; context.fillRect(0, 0, WIDTH, HEIGHT);

      screen.fillStyle = "#101d22"; screen.fillRect(0, 0, viewport.width, viewport.height);
      if (state.current.immersive && cameraModeRef.current === "follow") {
        const scale = Math.max(viewport.width / (TILE * 17), viewport.height / (TILE * 11));
        const visibleWidth = viewport.width / scale, visibleHeight = viewport.height / scale;
        const targetX = Math.max(0, Math.min(WIDTH - visibleWidth, playerX - visibleWidth / 2));
        const targetY = Math.max(0, Math.min(HEIGHT - visibleHeight, playerY - visibleHeight / 2));
        if (!camera.ready) { camera.x = targetX; camera.y = targetY; camera.ready = true; }
        camera.x = followMapCamera(camera.x, targetX, elapsed); camera.y = followMapCamera(camera.y, targetY, elapsed);
        const sourceX = Math.round(camera.x), sourceY = Math.round(camera.y);
        projection.current = { x: sourceX, y: sourceY, scale, left: 0, top: 0 };
        screen.drawImage(worldCanvas, sourceX, sourceY, visibleWidth, visibleHeight, 0, 0, viewport.width, viewport.height);
      } else {
        const scale = Math.min(viewport.width / WIDTH, viewport.height / HEIGHT);
        const left = (viewport.width - WIDTH * scale) / 2, top = (viewport.height - HEIGHT * scale) / 2;
        projection.current = { x: 0, y: 0, scale, left, top };
        screen.drawImage(worldCanvas, left, top, WIDTH * scale, HEIGHT * scale);
        camera.ready = false;
      }
      drawReadableLabels();
    }
    function frame(time: number) {
      if (!active) return;
      if (!document.hidden && time - previousFrame >= 1000 / 60) {
        previousFrame = time - ((time - previousFrame) % (1000 / 60));
        const elapsed = previousDraw ? time - previousDraw : 1000 / 60;
        previousDraw = time;
        const data = state.current;
        // Finish the prior segment before using its endpoint for the next tile.
        displayed.current = interpolateMapStep(motion.current.from, motion.current.to, time - motion.current.started);
        const npcPositions = targets().filter((t) => t.type !== "evidence");
        if (!data.canControl && remoteRoute.current.length && time - motion.current.started >= MAP_STEP_MS) {
          const next = remoteRoute.current.shift()!;
          if (distance(next, position.current) === 1 && isValidPosition(next) && !npcPositions.some(p => p.x === next.x && p.y === next.y)) {
            facing.current = next.x < position.current.x ? "left" : next.x > position.current.x ? "right" : next.y < position.current.y ? "up" : "down";
            motion.current = { from: { ...displayed.current }, to: next, started: nextMapStepStart(motion.current.started, time, elapsed) };
            position.current = next;
          } else remoteRoute.current = [];
        }
        const requested = data.navigationTarget;
        if (data.canControl && requested && navigationHandled.current !== requested.nonce) {
          navigationHandled.current = requested.nonce;
          const target = targets().find(candidate => candidate.type === 'evidence' && candidate.id === requested.id);
          if (target) {
            keys.current.clear();
            const nextRoute = pathTo(position.current, target, npcPositions, true);
            route.current = nextRoute; routeTarget.current = target;
            if (distance(target, position.current) <= 1) interact(target);
            else if (nextRoute.length) setTip('Route set: ' + target.label + '. Use movement controls to cancel.');
            else { routeTarget.current = null; setTip('No clear route from here. Move around the obstacle and try again.'); }
          }
        }
        if (data.canControl && !data.movementPending && time - lastStep.current >= MAP_STEP_MS) {
          let next: MapPosition | undefined;
          let fromRoute = false;
          const key = keys.current;
          if (key.has("arrowup") || key.has("w")) { next = { x: position.current.x, y: position.current.y - 1 }; facing.current = "up"; }
          else if (key.has("arrowdown") || key.has("s")) { next = { x: position.current.x, y: position.current.y + 1 }; facing.current = "down"; }
          else if (key.has("arrowleft") || key.has("a")) { next = { x: position.current.x - 1, y: position.current.y }; facing.current = "left"; }
          else if (key.has("arrowright") || key.has("d")) { next = { x: position.current.x + 1, y: position.current.y }; facing.current = "right"; }
          else if (route.current.length) {
            next = route.current[0]; fromRoute = true;
            if (next) facing.current = next.x < position.current.x ? "left" : next.x > position.current.x ? "right" : next.y < position.current.y ? "up" : "down";
          }
          if (next && distance(next, position.current) === 1 && isValidPosition(next) && !npcPositions.some((p) => p.x === next?.x && p.y === next?.y)) {
            if (data.onMove(next) !== false) {
              if (fromRoute) route.current.shift();
              const started = nextMapStepStart(lastStep.current, time, elapsed);
              motion.current = { from: { ...displayed.current }, to: next, started };
              position.current = next; lastStep.current = started; setCurrentRoom(roomAt(next)); playSfx("step");
            }
          } else if (next && routeTarget.current) {
            route.current = []; routeTarget.current = null;
          }
          if (!route.current.length && routeTarget.current && distance(routeTarget.current, position.current) <= 1) interact(routeTarget.current);
        }
        displayed.current = interpolateMapStep(motion.current.from, motion.current.to, time - motion.current.started);
        const closest = targets().find((t) => distance(t, position.current) <= 1) ?? null;
        const signature = closest ? `${closest.type}:${closest.id}` : "";
        if (signature !== lastNearby) { lastNearby = signature; setNearby(closest); }
        if (!data.canControl) setCurrentRoom(roomAt(position.current));
        draw(time, elapsed);
      }
      const remoteAnimating = !state.current.canControl && (remoteRoute.current.length > 0 || time - motion.current.started < MAP_STEP_MS);
      const delay = remoteAnimating && !document.hidden ? Math.round(1000 / 30) : audienceFrameDelay(state.current.canControl, document.hidden, time - motion.current.started < MAP_STEP_MS + 650);
      if (delay === null) { animation = 0; return; }
      if (delay === 0) animation = window.requestAnimationFrame(frame);
      else idleTimer = setTimeout(() => { idleTimer = null; animation = window.requestAnimationFrame(frame); }, delay);
    }
    const wake = () => {
      window.cancelAnimationFrame(animation);
      if (idleTimer !== null) { clearTimeout(idleTimer); idleTimer = null; }
      if (active && !document.hidden) animation = window.requestAnimationFrame(frame);
    };
    wakeFrame.current = wake;
    document.addEventListener('visibilitychange', wake);
    wake();
    return () => {
      active = false; window.cancelAnimationFrame(animation); pressedKeys.clear();
      if (idleTimer !== null) clearTimeout(idleTimer);
      wakeFrame.current = null;document.removeEventListener("visibilitychange", wake);
      resizeObserver.disconnect();
      window.removeEventListener("resize", fitCanvas); window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp); window.removeEventListener("blur", blur);
    };
    // Event handlers use refs to always receive current authoritative session props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const directionButton = (arrow: string, key: string, label: string) => <button
    type="button" className="map-direction-button" aria-label={label} disabled={!props.canControl}
    onKeyDown={event => { if ((event.key === "Enter" || event.key === " ") && !event.repeat) { event.preventDefault(); route.current = []; routeTarget.current = null; keys.current.add(key); } }}
    onKeyUp={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); keys.current.delete(key); } }} onBlur={() => keys.current.delete(key)}
    onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); route.current = []; routeTarget.current = null; keys.current.add(key); }}
    onPointerUp={() => keys.current.delete(key)} onPointerCancel={() => keys.current.delete(key)} onLostPointerCapture={() => keys.current.delete(key)}
    style={{ width: props.immersive ? 43 : 31, height: props.immersive ? 39 : 29, background: "#183e43ed", color: "#edf0ca", border: "2px solid #78988b", boxShadow: "inset 0 -3px #091e29, 2px 3px #07161999", borderRadius: 2, fontSize: props.immersive ? 21 : 16, lineHeight: 1, fontWeight: 700, cursor: props.canControl ? "pointer" : "default", touchAction: "none", opacity: props.canControl ? 1 : .4, fontFamily: "monospace" }}
  >{arrow}</button>;
  const dpad = props.canControl && <div className="map-dpad" aria-label="Movement controls" style={{ display: "flex", alignItems: "center", gap: 4, pointerEvents: "auto" }}>
    {directionButton("←", "a", "Move left")}
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{directionButton("↑", "w", "Move up")}{directionButton("↓", "s", "Move down")}</div>
    {directionButton("→", "d", "Move right")}
  </div>;
  const interactButton = props.canControl && <button className="map-interact-button" type="button" disabled={!props.canControl || !nearby} onClick={() => interact(nearby)} aria-label={nearby ? 'Interact with ' + nearby.label : "Move near a clue to interact"}
    style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 9, flex: "0 1 235px", minWidth: 0, maxWidth: props.immersive ? 235 : 220, minHeight: props.immersive ? 61 : 44, lineHeight: 1.3, borderRadius: 2, padding: "9px 11px", fontFamily: "monospace", fontWeight: 700, fontSize: props.immersive ? 13 : 11, border: '2px solid ' + (nearby && props.canControl ? '#d8c77d' : '#688577'), color: nearby && props.canControl ? '#fff3bd' : '#b6c8b9', background: nearby && props.canControl ? '#31564df5' : '#183832e8', boxShadow: 'inset 0 -3px #102721, 3px 3px #06141188', cursor: nearby && props.canControl ? "pointer" : "default" }}>
    <kbd style={{ flexShrink: 0, background: "#152a2c", border: "1px solid #6c8676", color: "#f5edc5", borderRadius: 0, padding: "3px 6px", fontSize: 13, lineHeight: 1.3 }}>E</kbd>
    <span style={{ textAlign: "left", minWidth: 0 }}><span style={{ display: "block", fontSize: 11, letterSpacing: 1 }}>{nearby?.type === 'suspect' || nearby?.type === 'officer' ? 'TALK' : nearby ? 'INSPECT' : 'INTERACT'}</span><span style={{ display: "block", fontSize: 12, fontWeight: 400, marginTop: 3, whiteSpace: "normal", overflowWrap: "anywhere" }}>{nearby ? nearby.label : 'Move near a person or clue'}</span></span>
  </button>;

  return <div className={"crime-map" + (props.immersive ? " crime-map-immersive" : "")} style={{ position: "relative", width: "100%", height: props.height ?? (props.immersive ? "100%" : undefined), overflow: "hidden", background: "#101d22", border: props.immersive ? 0 : "1px solid #20424d", borderRadius: props.immersive ? 0 : 10 }}>
    {!props.immersive && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "11px 14px", background: "#102b34", borderBottom: "1px solid #294652", fontFamily: "monospace", fontSize: 10, letterSpacing: "0.08em", color: "#9dbcc3" }}><span>⌖ ASTER RESEARCH LAB / FLOOR 01</span><span style={{ color: "#73c3b4" }}>● {props.canControl ? "DETECTIVE VIEW" : "LIVE FEED"}</span></div>}
    <div ref={viewportRef} style={{ position: "relative", lineHeight: 0, width: "100%", height: props.immersive ? "100%" : undefined, aspectRatio: props.immersive ? undefined : WIDTH + '/' + HEIGHT }}>
      <canvas ref={canvasRef} role="img" tabIndex={props.canControl ? 0 : -1} aria-label={props.canControl ? "Interactive map of Aster Research Lab. Use arrows or WASD to move, E to interact, or click to walk." : "Shared view of Aster Research Lab. Following the active facilitator; movement and interactions are read-only."}
        onPointerDown={(event) => { if (props.canControl) event.currentTarget.focus({ preventScroll: true }); }}
        onClick={(event) => {
          if (!props.canControl) return;
          const bounds = event.currentTarget.getBoundingClientRect(), view = projection.current;
          const p = { x: Math.floor(((event.clientX - bounds.left - view.left) / view.scale + view.x) / TILE), y: Math.floor(((event.clientY - bounds.top - view.top) / view.scale + view.y) / TILE) };
          const target = targets().find((t) => t.x === p.x && t.y === p.y);
          if (target && distance(target, position.current) <= 1) { interact(target); return; }
          const npcPositions = targets().filter((t) => t.type !== "evidence");
          const nextRoute = pathTo(position.current, p, npcPositions, !!target);
          if (nextRoute.length) { keys.current.clear(); route.current = nextRoute; routeTarget.current = target ?? null; }
          else if (target) setTip("Find a clear path to this clue.");
        }}
        style={{ position: "absolute", inset: 0, display: "block", width: "100%", height: "100%", imageRendering: "pixelated", cursor: props.canControl ? "crosshair" : "default", touchAction: "manipulation" }}
      />
      {props.immersive && <button className="map-camera-toggle" type="button" aria-label={cameraMode === 'follow' ? 'Show full floor plan' : 'Follow detective camera'} aria-pressed={cameraMode === 'floor'} onClick={() => setCameraMode(cameraMode === 'follow' ? 'floor' : 'follow')}
        style={{ position: "absolute", right: 100, top: 16, zIndex: 4, padding: "9px 11px", background: "#173934ec", color: "#e8e6bb", border: "2px solid #8ba38a", boxShadow: "3px 3px #071a2399", borderRadius: 0, fontFamily: "monospace", fontSize: 11, lineHeight: 1.3, letterSpacing: .8, cursor: "pointer" }}>▦ {cameraMode === 'follow' ? 'FLOOR PLAN' : 'FOLLOW'}</button>}
      {tip && <div role="status" style={{ position: "absolute", left: "50%", bottom: props.immersive ? 118 : 12, transform: "translateX(-50%)", border: "2px solid #b0bda1", background: "#173731f5", padding: "11px 15px", color: "#f0edce", lineHeight: 1.5, fontFamily: "monospace", fontSize: 12, textAlign: "center", width: "max-content", maxWidth: "85%" }}>{tip}</div>}
      {props.immersive && <div className="map-controls" style={{ position: "absolute", left: 18, right: 18, bottom: 20, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, pointerEvents: "none" }}>
        <div style={{ flex: "0 0 137px", minWidth: 0 }}>{dpad}<div style={{ marginTop: 9, fontFamily: "monospace", fontSize: 10, color: "#d9e6c8", lineHeight: 1.3, textShadow: "1px 2px #061e28, -1px -1px #061e28", letterSpacing: 1 }}>{currentRoom.toUpperCase()}</div></div>
        {props.canControl ? interactButton : <span style={{ color: "#d6e3c1", background: "#19352edb", border: "1px solid #76917b", padding: "9px 12px", font: "11px monospace", lineHeight: 1.3 }}>● FACILITATOR VIEW</span>}
      </div>}
    </div>
    {!props.immersive && <div style={{ padding: "10px 13px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, borderTop: "1px solid #284550", background: "#0c252e" }}>
      <div><div style={{ color: "#cadde0", fontSize: 11, fontWeight: 600 }}>{currentRoom}</div><div style={{ marginTop: 5, color: "#72939e", fontSize: 10 }}>{props.canControl ? "WASD / arrows to move · Click to walk" : "Following the active detective"}</div></div>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>{dpad}{interactButton}</div>
    </div>}
  </div>;
}
