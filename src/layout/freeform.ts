import type {
  FreeSeat,
  FreeTemplate,
  LayoutCell,
  LayoutConfig,
  Placement,
  Rotation,
} from "../state/types";
import { cellInfo, centroid, cellJunction, inscribed, insetCell, polyArea, powerCells, roundPoly, type Pt } from "./power";

/**
 * Freeform layouts: seats anywhere, each claiming its power-diagram cell.
 * A freeform LayoutConfig carries `cells` (what the board draws) and `seats`
 * (what the editor edits), plus ordinary grid `placements` approximating each
 * cell's face rectangle so every placement-based helper keeps working.
 */

/** A phone board, for the decisions that need a shape before one is measured. */
export const NOMINAL_W = 363;
export const NOMINAL_H = 760;
/** Fine grid the stand-in placements snap to. */
const GRID = 48;
/** Seats take this share of the board on entering the editor, so cells are visible round them. */
export const MARKER_SHARE = 0.4;
export const MAX_SEATS = 6;

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const ROTS: Rotation[] = [0, 90, 180, 270];
const isRot = (v: unknown): v is Rotation => ROTS.includes(v as Rotation);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const toPts = (poly: [number, number][]): Pt[] => poly.map(([x, y]) => ({ x, y }));

/** Placement approximating a cell's face rectangle on the fine grid. */
function standIn(playerId: string, raw: Pt[], rotation: Rotation): Placement {
  const W = NOMINAL_W;
  const H = NOMINAL_H;
  const poly = insetCell(raw, W, H);
  const r = poly.length >= 3 ? inscribed(poly) : { x: 0, y: 0, w: W, h: H };
  let c0 = Math.ceil((r.x / W) * GRID - 1e-6);
  let c1 = Math.floor(((r.x + r.w) / W) * GRID + 1e-6);
  let r0 = Math.ceil((r.y / H) * GRID - 1e-6);
  let r1 = Math.floor(((r.y + r.h) / H) * GRID + 1e-6);
  c0 = Math.max(0, Math.min(GRID - 1, c0));
  r0 = Math.max(0, Math.min(GRID - 1, r0));
  c1 = Math.max(c0 + 1, Math.min(GRID, c1));
  r1 = Math.max(r0 + 1, Math.min(GRID, r1));
  return { playerId, row: r0 + 1, col: c0 + 1, rowSpan: r1 - r0, colSpan: c1 - c0, rotation };
}

/** Effective facing of each seat: its own, else the nearest edge of its cell. */
export function seatFacings(seats: FreeSeat[], raw: Pt[][], W = NOMINAL_W, H = NOMINAL_H): Rotation[] {
  return seats.map((s, i) => {
    if (s.rot != null) return s.rot;
    const info = cellInfo(raw[i] ?? [], W, H);
    return info.area > 1 ? info.auto : 0;
  });
}

/** Bake seats into a freeform layout. Seat i becomes player p{i}. */
export function buildFreeLayout(seats: FreeSeat[], name = "Freeform", facings?: Rotation[]): LayoutConfig {
  const raw = powerCells(seats);
  const rots = facings && facings.length === seats.length ? facings : seatFacings(seats, raw);
  const ids = seats.map((_, i) => `p${i}`);
  const cells: LayoutCell[] = seats.map((_, i) => ({
    playerId: ids[i],
    poly: raw[i].map((p) => [r4(p.x), r4(p.y)] as [number, number]),
    rotation: rots[i],
  }));
  return {
    id: `free-${seats.length}`,
    name,
    playerCount: seats.length,
    rows: GRID,
    cols: GRID,
    placements: cells.map((c, i) => standIn(c.playerId, raw[i], c.rotation)),
    builtIn: false,
    cells,
    seats: seats.map((s, i) => ({
      playerId: ids[i],
      x: r4(s.x),
      y: r4(s.y),
      w: r4(s.w),
      h: r4(s.h),
      rot: s.rot,
    })),
  };
}

/** Scale a unit rect about its centre. */
function scaleAbout<T extends { x: number; y: number; w: number; h: number }>(r: T, k: number): T {
  const w = r.w * k;
  const h = r.h * k;
  return { ...r, x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

/** Seats for the editor from whatever the board shows now. */
export function seatsFromLayout(layout: LayoutConfig): FreeSeat[] {
  if (layout.seats && layout.seats.length === layout.placements.length) {
    return layout.seats.map((s) => ({ ...s }));
  }
  let seats: FreeSeat[];
  if (layout.cells && layout.cells.length) {
    seats = layout.cells.map((c) => {
      const poly = toPts(c.poly);
      const m = centroid(poly);
      const side = Math.sqrt(polyArea(poly));
      return { playerId: c.playerId, x: m.x - side / 2, y: m.y - side / 2, w: side, h: side, rot: c.rotation };
    });
  } else {
    // A grid layout: each tile becomes a seat with the same centre and size
    // ratio, so the cells come out close to the tiles they replace.
    seats = layout.placements.map((p) => ({
      playerId: p.playerId,
      x: (p.col - 1) / layout.cols,
      y: (p.row - 1) / layout.rows,
      w: p.colSpan / layout.cols,
      h: p.rowSpan / layout.rows,
      rot: p.rotation,
    }));
  }
  return shrinkToMarkers(seats);
}

/** Same centres, same size ratios, so the cells do not move; just room round each marker. */
export function shrinkToMarkers<T extends { x: number; y: number; w: number; h: number }>(seats: T[]): T[] {
  const tot = seats.reduce((s, t) => s + t.w * t.h, 0);
  if (tot <= MARKER_SHARE + 1e-6) return seats.map((s) => ({ ...s }));
  const k = Math.sqrt(MARKER_SHARE / tot);
  return seats.map((s) => scaleAbout(s, k));
}

/** Built-in templates. Both are Fill layouts on the board-as-unit-square. */
export const BUILTIN_TEMPLATES: FreeTemplate[] = [
  {
    // A seat at each edge midpoint, mirror images: equal weights, so an exact X.
    id: "x",
    name: "X",
    seats: (() => {
      const a = 0.4;
      const b = 0.24;
      return [
        { x: (1 - a) / 2, y: 0, w: a, h: b, rot: null },
        { x: 1 - b, y: (1 - a) / 2, w: b, h: a, rot: null },
        { x: (1 - a) / 2, y: 1 - b, w: a, h: b, rot: null },
        { x: 0, y: (1 - a) / 2, w: b, h: a, rot: null },
      ];
    })(),
  },
  {
    id: "grid",
    name: "Grid",
    seats: [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
    ].map(([cx, cy]) => ({ x: cx - 0.15, y: cy - 0.13, w: 0.3, h: 0.26, rot: null })),
  },
];

export function templateSeats(t: FreeTemplate): FreeSeat[] {
  return t.seats.map((s, i) => ({ playerId: `p${i}`, ...s }));
}

/** Templates compare by their seats, rounded as they are stored. */
export function templateKey(seats: Omit<FreeSeat, "playerId">[]): string {
  return JSON.stringify(seats.map((s) => [r4(s.x), r4(s.y), r4(s.w), r4(s.h), s.rot ?? null]));
}

export function toTemplateSeats(seats: FreeSeat[]): Omit<FreeSeat, "playerId">[] {
  return seats.map((s) => ({ x: r4(s.x), y: r4(s.y), w: r4(s.w), h: r4(s.h), rot: s.rot ?? null }));
}

/**
 * Turn order for a freeform layout: clockwise by each cell's centroid angle
 * round the board centre. Screen y runs down, so increasing atan2 sweeps
 * right -> down -> left -> up, clockwise on the table; like the grid sweep
 * it starts from the seat nearest due left going up. Ties break by seat.
 */
export function polyTurnOrder(cells: LayoutCell[]): string[] {
  const seats = cells.map((c) => {
    const m = centroid(toPts(c.poly));
    return { id: c.playerId, a: Math.atan2(m.y - 0.5, m.x - 0.5), seat: Number(c.playerId.slice(1)) };
  });
  return seats.sort((p, q) => p.a - q.a || p.seat - q.seat).map((s) => s.id);
}

/** The menu hexagon's home on a freeform layout, board fractions. */
export function polyHub(cells: LayoutCell[]): { x: number; y: number } {
  return cellJunction(
    cells.map((c) => toPts(c.poly)),
    NOMINAL_W,
    NOMINAL_H,
  );
}

function cleanSeat(v: unknown): Omit<FreeSeat, "playerId"> | null {
  const s = v as Record<string, unknown> | null;
  if (!s || typeof s !== "object") return null;
  if (!finite(s.x) || !finite(s.y) || !finite(s.w) || !finite(s.h)) return null;
  if (s.w <= 0 || s.h <= 0) return null;
  return { x: s.x, y: s.y, w: s.w, h: s.h, rot: isRot(s.rot) ? s.rot : null };
}

/**
 * A persisted freeform layout is kept only if its cells and seats are sound;
 * otherwise the freeform parts are dropped and its grid placements, which are
 * always valid by the time this runs, carry on as a plain grid layout.
 */
export function sanitizeFreeform(layout: LayoutConfig): LayoutConfig {
  if (layout.cells === undefined && layout.seats === undefined) return layout;
  const ids = layout.placements.map((p) => p.playerId);
  const cells = layout.cells;
  const cellsOk =
    Array.isArray(cells) &&
    cells.length === ids.length &&
    cells.every(
      (c, i) =>
        !!c &&
        c.playerId === ids[i] &&
        isRot(c.rotation) &&
        Array.isArray(c.poly) &&
        c.poly.length >= 3 &&
        c.poly.every((p) => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1])),
    );
  if (!cellsOk) {
    const { cells: _c, seats: _s, ...grid } = layout;
    return grid;
  }
  const seats = Array.isArray(layout.seats) ? layout.seats : null;
  const seatsOk =
    !!seats &&
    seats.length === ids.length &&
    seats.every((s, i) => !!cleanSeat(s) && s.playerId === ids[i]);
  if (seatsOk) return layout;
  const { seats: _s, ...rest } = layout;
  return rest;
}

export function sanitizeTemplates(v: unknown): FreeTemplate[] {
  if (!Array.isArray(v)) return [];
  const out: FreeTemplate[] = [];
  for (const t of v) {
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    if (typeof o.id !== "string" || !Array.isArray(o.seats)) continue;
    const seats = o.seats.map(cleanSeat);
    if (seats.length < 1 || seats.length > MAX_SEATS || seats.some((s) => !s)) continue;
    out.push({ id: o.id, name: typeof o.name === "string" ? o.name : "Layout", seats: seats as FreeTemplate["seats"] });
  }
  return out;
}


/** How a freeform seat's tile is drawn on a W x H px board. */
export interface PolyGeom {
  /** The cell's bounding box on the board, px: where the tile element sits. */
  box: { x: number; y: number; w: number; h: number };
  /** CSS clip-path for the rounded cell, relative to box. */
  clip: string;
  /** The same outline as an SVG path, relative to box (active / lethal ring). */
  ring: string;
  /** Largest inscribed rectangle, relative to box: where the face goes. */
  face: { x: number; y: number; w: number; h: number };
  /** The rounded outline's points, relative to box (for placing ⋯ and the timer). */
  poly: Pt[];
  /** The menu hexagon's centre, relative to box (null with fewer than two cells). */
  hub: Pt | null;
}

export function polyGeoms(cells: LayoutCell[], W: number, H: number): Map<string, PolyGeom> {
  const out = new Map<string, PolyGeom>();
  const hub = cells.length > 1 ? polyHub(cells) : null;
  for (const c of cells) {
    const info = cellInfo(toPts(c.poly), W, H);
    if (info.poly.length < 3) continue;
    const xs = info.poly.map((p) => p.x);
    const ys = info.poly.map((p) => p.y);
    const bx = Math.min(...xs);
    const by = Math.min(...ys);
    const pts = roundPoly(info.poly, 20).map((p) => ({ x: p.x - bx, y: p.y - by }));
    out.set(c.playerId, {
      box: { x: bx, y: by, w: Math.max(...xs) - bx, h: Math.max(...ys) - by },
      clip: "polygon(" + pts.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(",") + ")",
      ring: "M" + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L") + "Z",
      face: { x: info.rect.x - bx, y: info.rect.y - by, w: info.rect.w, h: info.rect.h },
      poly: pts,
      hub: hub ? { x: hub.x * W - bx, y: hub.y * H - by } : null,
    });
  }
  return out;
}

/** Is (x, y) inside the polygon? Even-odd rule. */
function insidePoly(poly: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * The plain grid closest to a freeform layout, for the Customize painter,
 * which only paints rectangles on a small grid. Every grid up to the
 * painter's usual 4 rows x 3 columns is tried: each square goes to the cell
 * covering most of it (sampled), and a grid counts only if every seat ends
 * up one solid rectangle. The one agreeing with the cells over the most of
 * the board wins, the coarser on a tie -- an X comes out 4 x 2: a seat
 * across the top, two side by side, one across the bottom, a quarter each. null when no grid
 * keeps every seat a rectangle. Seats keep their ids and facings.
 */
export function gridApprox(layout: LayoutConfig, maxRows = 4, maxCols = 3): LayoutConfig | null {
  const cells = layout.cells;
  if (!cells?.length) return null;
  const polys = cells.map((c) => toPts(c.poly));
  const n = cells.length;
  const S = 6;
  let best: { rows: number; cols: number; grid: number[][]; score: number } | null = null;
  for (let rows = 1; rows <= maxRows; rows++)
    for (let cols = 1; cols <= maxCols; cols++) {
      if (rows * cols < n) continue;
      let score = 0;
      const grid: number[][] = [];
      for (let r = 0; r < rows; r++) {
        grid.push([]);
        for (let c = 0; c < cols; c++) {
          const hits = new Array<number>(n).fill(0);
          for (let i = 0; i < S; i++)
            for (let j = 0; j < S; j++) {
              const k = polys.findIndex((p) => insidePoly(p, (c + (i + 0.5) / S) / cols, (r + (j + 0.5) / S) / rows));
              if (k >= 0) hits[k]++;
            }
          const k = hits.indexOf(Math.max(...hits));
          grid[r].push(k);
          score += hits[k] / (S * S * rows * cols);
        }
      }
      const solid = cells.every((_, k) => {
        let r0 = Infinity, r1 = -1, c0 = Infinity, c1 = -1;
        grid.forEach((row, r) => row.forEach((v, c) => {
          if (v !== k) return;
          r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c);
        }));
        if (r1 < 0) return false;
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (grid[r][c] !== k) return false;
        return true;
      });
      if (!solid) continue;
      if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && rows * cols < best.rows * best.cols))
        best = { rows, cols, grid, score };
    }
  if (!best) return null;
  const { rows, cols, grid } = best;
  const placements: Placement[] = cells.map((cell, k) => {
    let r0 = Infinity, r1 = -1, c0 = Infinity, c1 = -1;
    grid.forEach((row, r) => row.forEach((v, c) => {
      if (v !== k) return;
      r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c);
    }));
    return { playerId: cell.playerId, row: r0 + 1, col: c0 + 1, rowSpan: r1 - r0 + 1, colSpan: c1 - c0 + 1, rotation: cell.rotation };
  });
  return { id: `${layout.id}-grid`, name: layout.name, playerCount: n, rows, cols, placements, builtIn: false };
}
