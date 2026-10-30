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
  /** The point is the middle of the board, where the menu hexagon sits. */
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

/**
 * Candidates are every half-cell point on the tile's border, so a shared edge
 * counts by its middle (two players head to head) as well as by its corners.
 * Ties go to the point nearest the middle of the board, then to scan order,
 * so the answer never flips between renders.
 */
export function junctionFor(
  layout: Pick<LayoutConfig, "rows" | "cols" | "placements">,
  playerId: string,
): TileJunction | null {
  const self = layout.placements.find((p) => p.playerId === playerId);
  if (!self) return null;
  const me = rectOf(self);
  const rects = layout.placements.map(rectOf);
  const cx = layout.cols / 2;
  const cy = layout.rows / 2;

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
