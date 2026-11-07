import type { LayoutConfig, Placement, Rotation } from "../state/types";
import { defaultLayoutFor } from "./presets";

/**
 * The board as seats round a real table: a head and a foot end, and two long
 * sides. Many layouts are exactly a seat table; dragging a seat in those
 * rebuilds the grid from the table. Anything else Customize can build is
 * edited in place instead -- split and merge -- so it is never re-tidied.
 */
export type Side = "top" | "right" | "bottom" | "left";
export const SIDES: Side[] = ["top", "right", "bottom", "left"];
export interface SeatTable {
  top: string[];
  right: string[];
  bottom: string[];
  left: string[];
}
export type Grid = Pick<LayoutConfig, "rows" | "cols" | "placements">;

export const FACING: Record<Side, Rotation> = { top: 180, right: 270, bottom: 0, left: 90 };
export const SIDE_OF: Record<Rotation, Side> = { 180: "top", 270: "right", 0: "bottom", 90: "left" };
export const END_MAX = 2;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

/** Smallest equivalent grid: divides every track count by their gcd. */
export function normalize(g: Grid): Grid {
  let gr = g.rows;
  let gc = g.cols;
  for (const p of g.placements) {
    gr = gcd(gcd(gr, p.row - 1), p.rowSpan);
    gc = gcd(gcd(gc, p.col - 1), p.colSpan);
  }
  return {
    rows: g.rows / gr,
    cols: g.cols / gc,
    placements: g.placements.map((p) => ({
      ...p,
      row: (p.row - 1) / gr + 1,
      rowSpan: p.rowSpan / gr,
      col: (p.col - 1) / gc + 1,
      colSpan: p.colSpan / gc,
    })),
  };
}

/** Identity of a layout's shape (and optionally facings), scale-free. */
export function geomKey(g: Grid, withRot = false): string {
  const n = normalize(g);
  return (
    `${n.rows}x${n.cols}|` +
    [...n.placements]
      .sort((a, b) => (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0))
      .map((p) => [p.playerId, p.row, p.col, p.rowSpan, p.colSpan, withRot ? p.rotation : ""].join(","))
      .join(";")
  );
}

/** Every cell covered exactly once, nothing outside the grid. */
export function gapFree(g: Grid): boolean {
  if (!(g.rows >= 1 && g.cols >= 1) || g.rows * g.cols > 4096) return false;
  const cells = new Array(g.rows * g.cols).fill(0);
  for (const p of g.placements) {
    if (p.row < 1 || p.col < 1 || p.rowSpan < 1 || p.colSpan < 1) return false;
    if (p.row - 1 + p.rowSpan > g.rows || p.col - 1 + p.colSpan > g.cols) return false;
    for (let y = p.row - 1; y < p.row - 1 + p.rowSpan; y++)
      for (let x = p.col - 1; x < p.col - 1 + p.colSpan; x++) cells[y * g.cols + x]++;
  }
  return cells.every((c) => c === 1);
}

/** Build the grid for a seat table. Unequal sides share rows via lcm. */
export function derive(t: SeatTable, rot: Record<string, Rotation> = {}): Grid {
  const L = t.left.length;
  const R = t.right.length;
  const T = t.top.length;
  const B = t.bottom.length;
  const M = L && R ? lcm(L, R) : L || R;
  const S = Math.max(L, R);
  const k = S ? M / S : 1;
  const tr = T ? k : 0;
  const br = B ? k : 0;
  const rows = tr + M + br;
  const cols = lcm(lcm(L && R ? 2 : 1, T || 1), B || 1);
  const out: Placement[] = [];
  const r = (id: string, s: Side) => rot[id] ?? FACING[s];
  const put = (id: string, s: Side, row: number, rowSpan: number, col: number, colSpan: number) =>
    out.push({ playerId: id, row, rowSpan, col, colSpan, rotation: r(id, s) });
  t.top.forEach((id, i) => put(id, "top", 1, k, 1 + (i * cols) / T, cols / T));
  t.bottom.forEach((id, i) => put(id, "bottom", 1 + tr + M, k, 1 + (i * cols) / B, cols / B));
  t.left.forEach((id, i) => put(id, "left", 1 + tr + (i * M) / L, M / L, 1, R ? cols / 2 : cols));
  t.right.forEach((id, i) =>
    put(id, "right", 1 + tr + (i * M) / R, M / R, L ? cols / 2 + 1 : 1, L ? cols / 2 : cols),
  );
  return normalize({ rows: rows || 1, cols, placements: out });
}

function edgesOf(g: Grid, p: Placement): Side[] {
  const e: Side[] = [];
  if (p.row === 1) e.push("top");
  if (p.col + p.colSpan - 1 === g.cols) e.push("right");
  if (p.row + p.rowSpan - 1 === g.rows) e.push("bottom");
  if (p.col === 1) e.push("left");
  return e;
}

export interface ReadTable {
  table: SeatTable;
  /** derive(table) reproduces the layout exactly. */
  exact: boolean;
  /** Every seat sits on the side it faces. */
  faithful: boolean;
}

const readCache = new WeakMap<object, ReadTable>();

/** Read a layout as a seat table, if it is one. */
export function readTable(g: Grid): ReadTable {
  const hit = readCache.get(g.placements);
  if (hit) return hit;
  const ps = [...g.placements].sort((a, b) => +a.playerId.slice(1) - +b.playerId.slice(1));
  const cands = ps.map((p) => [...new Set<Side>([...edgesOf(g, p), SIDE_OF[p.rotation] ?? "bottom"])]);
  const rot = Object.fromEntries(g.placements.map((p) => [p.playerId, p.rotation]));
  const target = geomKey(g);
  const cy = (p: Placement) => p.row + p.rowSpan / 2;
  const cx = (p: Placement) => p.col + p.colSpan / 2;
  const idx = ps.map(() => 0);
  let best: { table: SeatTable; match: number; ends: number } | null = null;
  let fallback: SeatTable | null = null;
  for (let guard = 0; guard < 20000; guard++) {
    const t: Record<Side, Placement[]> = { top: [], right: [], bottom: [], left: [] };
    ps.forEach((p, i) => t[cands[i][idx[i]]].push(p));
    t.left.sort((a, b) => cy(a) - cy(b) || cx(a) - cx(b));
    t.right.sort((a, b) => cy(a) - cy(b) || cx(a) - cx(b));
    t.top.sort((a, b) => cx(a) - cx(b) || cy(a) - cy(b));
    t.bottom.sort((a, b) => cx(a) - cx(b) || cy(a) - cy(b));
    const tab: SeatTable = {
      top: t.top.map((p) => p.playerId),
      right: t.right.map((p) => p.playerId),
      bottom: t.bottom.map((p) => p.playerId),
      left: t.left.map((p) => p.playerId),
    };
    const match = ps.filter((p, i) => cands[i][idx[i]] === SIDE_OF[p.rotation]).length;
    const ends = tab.top.length + tab.bottom.length;
    if (match === ps.length && !fallback) fallback = tab;
    if (
      (!best || match > best.match || (match === best.match && ends < best.ends)) &&
      geomKey(derive(tab, rot)) === target
    ) {
      best = { table: tab, match, ends };
    }
    let i = ps.length - 1;
    while (i >= 0 && idx[i] === cands[i].length - 1) idx[i--] = 0;
    if (i < 0) break;
    idx[i]++;
  }
  const res: ReadTable = best
    ? { table: best.table, exact: true, faithful: best.match === ps.length }
    : {
        table: fallback ?? { top: [], right: [], bottom: ps.map((p) => p.playerId), left: [] },
        exact: false,
        faithful: false,
      };
  readCache.set(g.placements, res);
  return res;
}

/** Seats clockwise round the table, as a real table reads. */
export function tableRing(t: SeatTable): string[] {
  return [...t.top, ...t.right, ...[...t.bottom].reverse(), ...[...t.left].reverse()];
}

// ---------------------------------------------------------------- split/merge

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const boxOf = (p: Placement): Box => ({
  x0: p.col - 1,
  y0: p.row - 1,
  x1: p.col - 1 + p.colSpan,
  y1: p.row - 1 + p.rowSpan,
});
const fromBox = (p: Placement, b: Box): Placement => ({
  ...p,
  col: b.x0 + 1,
  row: b.y0 + 1,
  colSpan: b.x1 - b.x0,
  rowSpan: b.y1 - b.y0,
});

/**
 * Take a seat off the board: its cell goes to the neighbour(s) on one side
 * whose edges exactly cover it, so they stay rectangles. Fewest neighbours
 * wins, then those facing the same way as the leaver (same bench). Null when
 * no side fits (a pinwheel), and then the seat can only swap.
 */
export function removeSeat(g: Grid, pid: string): Grid | null {
  const me = g.placements.find((p) => p.playerId === pid);
  if (!me) return null;
  const v = boxOf(me);
  const rest = g.placements.filter((p) => p !== me);
  if (!rest.length) return null;
  type Opt = { side: Side; ns: Placement[] };
  const opts: Opt[] = [];
  for (const side of SIDES) {
    const ns = rest.filter((p) => {
      const b = boxOf(p);
      if (side === "left") return b.x1 === v.x0 && b.y0 < v.y1 && b.y1 > v.y0;
      if (side === "right") return b.x0 === v.x1 && b.y0 < v.y1 && b.y1 > v.y0;
      if (side === "top") return b.y1 === v.y0 && b.x0 < v.x1 && b.x1 > v.x0;
      return b.y0 === v.y1 && b.x0 < v.x1 && b.x1 > v.x0;
    });
    if (!ns.length) continue;
    const horiz = side === "left" || side === "right";
    const inside = ns.every((p) => {
      const b = boxOf(p);
      return horiz ? b.y0 >= v.y0 && b.y1 <= v.y1 : b.x0 >= v.x0 && b.x1 <= v.x1;
    });
    const covered = ns.reduce((n, p) => {
      const b = boxOf(p);
      return n + (horiz ? b.y1 - b.y0 : b.x1 - b.x0);
    }, 0);
    if (inside && covered === (horiz ? v.y1 - v.y0 : v.x1 - v.x0)) opts.push({ side, ns });
  }
  if (!opts.length) return null;
  const same = (o: Opt) => o.ns.filter((p) => p.rotation === me.rotation).length;
  opts.sort((a, b) => a.ns.length - b.ns.length || same(b) - same(a));
  const { side, ns } = opts[0];
  const grow = new Set(ns);
  const placements = rest.map((p) => {
    if (!grow.has(p)) return p;
    const b = boxOf(p);
    if (side === "left") b.x1 = v.x1;
    else if (side === "right") b.x0 = v.x0;
    else if (side === "top") b.y1 = v.y1;
    else b.y0 = v.y0;
    return fromBox(p, b);
  });
  return trim({ rows: g.rows, cols: g.cols, placements });
}

/** Drop tracks nobody starts or ends on, so the grid stays minimal. */
function trim(g: Grid): Grid {
  return normalize(g);
}

function scale(g: Grid, sy: number, sx: number): Grid {
  return {
    rows: g.rows * sy,
    cols: g.cols * sx,
    placements: g.placements.map((p) => ({
      ...p,
      row: (p.row - 1) * sy + 1,
      rowSpan: p.rowSpan * sy,
      col: (p.col - 1) * sx + 1,
      colSpan: p.colSpan * sx,
    })),
  };
}

/** Put a seat in half of another tile, on that tile's `edge`. */
export function splitInto(g: Grid, target: string, edge: Side, pid: string, rotation: Rotation): Grid | null {
  const q0 = g.placements.find((p) => p.playerId === target);
  if (!q0) return null;
  const vert = edge === "top" || edge === "bottom";
  const s = scale(g, vert ? 2 : 1, vert ? 1 : 2);
  const q = s.placements.find((p) => p.playerId === target)!;
  const b = boxOf(q);
  const mine = { ...b };
  const theirs = { ...b };
  if (edge === "top") mine.y1 = theirs.y0 = (b.y0 + b.y1) / 2;
  else if (edge === "bottom") mine.y0 = theirs.y1 = (b.y0 + b.y1) / 2;
  else if (edge === "left") mine.x1 = theirs.x0 = (b.x0 + b.x1) / 2;
  else mine.x0 = theirs.x1 = (b.x0 + b.x1) / 2;
  const me: Placement = fromBox({ ...q, playerId: pid, rotation }, mine);
  return normalize({
    rows: s.rows,
    cols: s.cols,
    placements: [...s.placements.map((p) => (p === q ? fromBox(p, theirs) : p)), me],
  });
}

/** A new full-width band at the head or foot, as deep as the shallowest tile there. */
export function addStrip(g: Grid, edge: "top" | "bottom", pid: string): Grid {
  const along = g.placements.filter((p) => (edge === "top" ? p.row === 1 : p.row + p.rowSpan - 1 === g.rows));
  const d = Math.max(1, Math.min(...along.map((p) => p.rowSpan)));
  const shifted = g.placements.map((p) => (edge === "top" ? { ...p, row: p.row + d } : p));
  const me: Placement = {
    playerId: pid,
    row: edge === "top" ? 1 : g.rows + 1,
    rowSpan: d,
    col: 1,
    colSpan: g.cols,
    rotation: FACING[edge],
  };
  return normalize({ rows: g.rows + d, cols: g.cols, placements: [...shifted, me] });
}

// ----------------------------------------------------------------- candidates

export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Each seat's rect in px for a board of this size and gap. */
export function pxRects(g: Grid, W: number, H: number, gap: number): Record<string, PxRect> {
  const uw = (W - (g.cols - 1) * gap) / g.cols;
  const uh = (H - (g.rows - 1) * gap) / g.rows;
  const out: Record<string, PxRect> = {};
  for (const p of g.placements) {
    out[p.playerId] = {
      x: (p.col - 1) * (uw + gap),
      y: (p.row - 1) * (uh + gap),
      w: p.colSpan * uw + (p.colSpan - 1) * gap,
      h: p.rowSpan * uh + (p.rowSpan - 1) * gap,
    };
  }
  return out;
}

export const FLOOR = { short: 90, long: 120 };
export function fits(g: Grid, W: number, H: number, gap: number): boolean {
  return Object.values(pxRects(g, W, H, gap)).every(
    (r) => Math.min(r.w, r.h) >= FLOOR.short - 0.5 && Math.max(r.w, r.h) >= FLOOR.long - 0.5,
  );
}

export type Move =
  | { kind: "slot"; side: Side; index: number; grid: Grid }
  | { kind: "split"; target: string; edge: Side; grid: Grid }
  | { kind: "strip"; edge: "top" | "bottom"; grid: Grid };

export interface MovePlan {
  /** The layout is a seat table: moves rebuild it from the table. */
  table: boolean;
  moves: Move[];
  /** An end already holds END_MAX others. */
  locked: Partial<Record<Side, true>>;
}

/** Every structural move for seat `pid`, sized for a board W x H. */
export function planMoves(g: Grid, pid: string, W: number, H: number, gap: number): MovePlan {
  const me = g.placements.find((p) => p.playerId === pid);
  const plan: MovePlan = { table: false, moves: [], locked: {} };
  if (!me || g.placements.length < 2) return plan;
  const rot = Object.fromEntries(g.placements.map((p) => [p.playerId, p.rotation])) as Record<string, Rotation>;
  const read = readTable(g);
  const startKey = geomKey(g, true);
  const keep = (grid: Grid) => fits(grid, W, H, gap) && gapFree(grid) && geomKey(grid, true) !== startKey;

  if (read.exact) {
    plan.table = true;
    const oldSide = SIDES.find((s) => read.table[s].includes(pid))!;
    const rest: SeatTable = {
      top: read.table.top.filter((x) => x !== pid),
      right: read.table.right.filter((x) => x !== pid),
      bottom: read.table.bottom.filter((x) => x !== pid),
      left: read.table.left.filter((x) => x !== pid),
    };
    for (const side of SIDES) {
      const end = side === "top" || side === "bottom";
      if (end && rest[side].length >= END_MAX) {
        plan.locked[side] = true;
        continue;
      }
      for (let i = 0; i <= rest[side].length; i++) {
        const t: SeatTable = { ...rest, [side]: [...rest[side]] };
        t[side].splice(i, 0, pid);
        const r = { ...rot };
        if (side !== oldSide) r[pid] = FACING[side];
        const grid = derive(t, r);
        if (keep(grid)) plan.moves.push({ kind: "slot", side, index: i, grid });
      }
    }
    return plan;
  }

  const base = removeSeat(g, pid);
  if (!base) return plan;
  for (const q of base.placements) {
    for (const edge of SIDES) {
      const grid = splitInto(base, q.playerId, edge, pid, q.rotation);
      if (grid && keep(grid)) plan.moves.push({ kind: "split", target: q.playerId, edge, grid });
    }
  }
  for (const edge of ["top", "bottom"] as const) {
    const grid = addStrip(base, edge, pid);
    if (keep(grid)) plan.moves.push({ kind: "strip", edge, grid });
  }
  return plan;
}

/** Exchange two seats' players; the cells and their facings stay put. */
export function swapSeats<T extends Grid>(g: T, a: string, b: string): T {
  return {
    ...g,
    placements: g.placements.map((p) =>
      p.playerId === a ? { ...p, playerId: b } : p.playerId === b ? { ...p, playerId: a } : p,
    ),
  };
}

/** Wrap a grid as a layout, reusing the preset's name when it is one. */
export function asLayout(g: Grid, playerCount: number): LayoutConfig {
  const preset = defaultLayoutFor(playerCount);
  const n = normalize(g);
  if (geomKey(n, true) === geomKey(preset, true)) return preset;
  return {
    id: `arranged-${playerCount}`,
    name: `${playerCount} players`,
    builtIn: false,
    playerCount,
    rows: n.rows,
    cols: n.cols,
    placements: n.placements.map((p) => ({ ...p })),
  };
}
