import type { LayoutConfig, Placement } from "../state/types";

/**
 * Where on a tile's edge the "corner timer" sits: the point on its border that
 * the most other tiles also touch -- the middle of the table, as the players
 * see it. Everything is in screen space, before the tile's own rotation.
 */
export interface TileJunction {
  /** The point as a fraction of the tile's own box, 0..1 on each axis. */
  fx: number;
  fy: number;
  /** Which way is "into the tile" from that point: -1, 0 or 1 per axis. */
  sx: -1 | 0 | 1;
  sy: -1 | 0 | 1;
  /** How many tiles meet there, this one included. */
  touching: number;
  /** The point is the board's hub (see boardHub), where the menu hexagon sits. */
  atCenter: boolean;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const rectOf = (p: Placement): Rect => ({
  x0: p.col - 1,
  y0: p.row - 1,
  x1: p.col - 1 + p.colSpan,
  y1: p.row - 1 + p.rowSpan,
});

const touches = (r: Rect, x: number, y: number) =>
  x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

const dir = (v: number, lo: number, hi: number): -1 | 0 | 1 =>
  v === lo ? 1 : v === hi ? -1 : 0;

type Grid = Pick<LayoutConfig, "rows" | "cols" | "placements">;

/** The hub in grid units (cells), for the half-cell scans below. */
function hubCells(layout: Grid): { x: number; y: number } {
  const { rows, cols } = layout;
  const rects = layout.placements.map(rectOf);
  let best: { x: number; y: number; n: number; d: number } | null = null;
  for (let y = 0; y <= rows; y += 0.5) {
    for (let x = 0; x <= cols; x += 0.5) {
      const n = rects.filter((r) => touches(r, x, y)).length;
      if (n < 2) continue;
      const d = Math.hypot(x / cols - 0.5, y / rows - 0.5);
      // Scan order is y then x, so a strict "better" keeps the smaller y, x.
      if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) <= 1e-9 && n > best.n)) {
        best = { x, y, n, d };
      }
    }
  }
  return best ?? { x: cols / 2, y: rows / 2 };
}

/**
 * Where the menu hexagon sits, as board fractions (0..1 on each axis): the
 * middle of the board when tiles meet there -- every built-in does -- or
 * else the nearest half-cell point where two or more tiles meet, so it never
 * lands on someone's life total. Ties go to more tiles meeting, then the
 * higher point, then the one further left. One seat: the middle.
 */
export function boardHub(layout: Grid): { x: number; y: number } {
  const h = hubCells(layout);
  return { x: h.x / layout.cols, y: h.y / layout.rows };
}

/**
 * How far the menu hexagon and the game clock under it reach from the hub,
 * in screen px, plus a few px to spare. The column (54px hexagon, 5px gap,
 * ~20px clock) is centred as a whole on the hub, so the hexagon's top is
 * ~40px above it and the clock's foot ~44px below; sideways the hexagon is
 * 27px and a long clock (1:23:45) ~33px.
 */
export const HUB_REACH = { left: 35, right: 35, up: 43, down: 47 };

/**
 * Grid gaps to add to a board fraction f (a grid line or half-cell point) to
 * land on the same spot of the rendered board: n tracks share the board less
 * (n-1) gaps, so the point at u cells sits at u/n of the board plus
 * (u/n - 1/2) gaps -- for a line, the middle of its gap. The board's own
 * edges have no gap outside them.
 */
export const gapShift = (f: number) => (f > 0 && f < 1 ? f - 0.5 : 0);

/**
 * Candidates are every half-cell point on the tile's border, so a shared edge
 * counts by its middle (two players head to head) as well as by its corners.
 * Ties go to the point nearest the hub (the middle of the board in every
 * built-in), then to scan order, so the answer never flips between renders.
 */
export function junctionFor(layout: Grid, playerId: string): TileJunction | null {
  const self = layout.placements.find((p) => p.playerId === playerId);
  if (!self) return null;
  const me = rectOf(self);
  const rects = layout.placements.map(rectOf);
  const { x: cx, y: cy } = hubCells(layout);

  let best: { x: number; y: number; n: number; d: number } | null = null;
  for (let y = me.y0; y <= me.y1; y += 0.5) {
    for (let x = me.x0; x <= me.x1; x += 0.5) {
      const onBorder = x === me.x0 || x === me.x1 || y === me.y0 || y === me.y1;
      if (!onBorder) continue;
      const n = rects.filter((r) => touches(r, x, y)).length;
      const d = Math.hypot(x - cx, y - cy);
      if (!best || n > best.n || (n === best.n && d < best.d - 1e-9)) {
        best = { x, y, n, d };
      }
    }
  }
  if (!best) return null;

  const w = me.x1 - me.x0;
  const h = me.y1 - me.y0;
  return {
    fx: (best.x - me.x0) / w,
    fy: (best.y - me.y0) / h,
    sx: dir(best.x, me.x0, me.x1),
    sy: dir(best.y, me.y0, me.y1),
    touching: best.n,
    atCenter: best.x === cx && best.y === cy,
  };
}
