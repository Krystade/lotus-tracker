import type { Rotation } from "../state/types";

/**
 * Freeform "Gaps: Fill" geometry: a power diagram (weighted Voronoi) of the
 * seats, worked out on the board as a unit square so a layout scales with the
 * board, and four seats at the edge midpoints meet in an exact X whatever the
 * aspect ratio. Each seat's weight is VOR_K times its share of all seat area:
 * a bigger seat pushes its borders out, and scaling every seat by the same
 * factor changes nothing. Borders are straight, so every cell is convex.
 *
 * Ported from the layout-editor prototype; pure, so it is unit tested.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A seat marker in unit-square coordinates. Its centre is the site. */
export interface SiteRect extends Rect {
  rot?: Rotation | null;
}

export const VOR_K = 0.5;
/** Px between neighbouring cells, as the grid layouts' gap. */
export const CELL_GAP = 8;
/** A cell smaller than this (px²) or whose face is thinner than MIN_SIDE is unusable. */
export const MIN_AREA = 5200;
export const MIN_SIDE = 62;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Keep the part of a convex polygon where f(p) <= 0. */
export function clipPoly(poly: Pt[], f: (p: Pt) => number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const fp = f(p);
    const fq = f(q);
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return out;
}

export function polySigned(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

export function polyArea(poly: Pt[]): number {
  return poly.length >= 3 ? Math.abs(polySigned(poly)) : 0;
}

/** Area-weighted centroid; the vertex mean for a degenerate polygon. */
export function centroid(poly: Pt[]): Pt {
  const a = polySigned(poly);
  if (Math.abs(a) < 1e-12) {
    const n = poly.length || 1;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const k = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * k;
    cy += (p.y + q.y) * k;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function dedupe(poly: Pt[], e: number): Pt[] {
  const out: Pt[] = [];
  for (const p of poly) if (!out.length || dist(out[out.length - 1], p) > e) out.push(p);
  while (out.length > 1 && dist(out[0], out[out.length - 1]) <= e) out.pop();
  return out;
}

/** Raw cells (no gaps) in unit-square coordinates, one per seat; [] when a seat is squeezed out. */
export function powerCells(seats: Rect[]): Pt[][] {
  const tot = seats.reduce((s, t) => s + t.w * t.h, 0) || 1;
  const site = seats.map((t) => ({ x: t.x + t.w / 2, y: t.y + t.h / 2, w: (VOR_K * t.w * t.h) / tot }));
  return site.map((a, i) => {
    let poly: Pt[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    for (let j = 0; j < site.length && poly.length >= 3; j++) {
      if (j === i) continue;
      const b = site[j];
      const nx = 2 * (b.x - a.x);
      const ny = 2 * (b.y - a.y);
      // Closer to a than b in power distance: |p-a|² - wa <= |p-b|² - wb  <=>  n·p <= k
      const k = b.x * b.x + b.y * b.y - a.x * a.x - a.y * a.y - b.w + a.w;
      if (Math.abs(nx) + Math.abs(ny) < 1e-9) {
        if (a.w < b.w || (a.w === b.w && j < i)) poly = [];
        continue;
      }
      poly = clipPoly(poly, (p) => nx * p.x + ny * p.y - k);
    }
    poly = dedupe(poly, 1e-6);
    return poly.length >= 3 ? poly : [];
  });
}

const onBoardEdge = (p: Pt, q: Pt, W: number, H: number) =>
  (p.x < 0.5 && q.x < 0.5) ||
  (p.x > W - 0.5 && q.x > W - 0.5) ||
  (p.y < 0.5 && q.y < 0.5) ||
  (p.y > H - 0.5 && q.y > H - 0.5);

/** A raw unit-square cell in board px, every shared border pulled in gap/2 (board edges stay put). */
export function insetCell(raw: Pt[], W: number, H: number, gap = CELL_GAP): Pt[] {
  const P = raw.map((p) => ({ x: p.x * W, y: p.y * H }));
  if (P.length < 3) return [];
  const sgn = polySigned(P) > 0 ? 1 : -1;
  let poly: Pt[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ];
  for (let i = 0; i < P.length && poly.length >= 3; i++) {
    const p = P[i];
    const q = P[(i + 1) % P.length];
    if (onBoardEdge(p, q, W, H)) continue;
    let mx = -(q.y - p.y) * sgn;
    let my = (q.x - p.x) * sgn;
    const L = Math.hypot(mx, my);
    if (L < 1e-6) continue;
    mx /= L;
    my /= L;
    const k = mx * p.x + my * p.y + gap / 2;
    poly = clipPoly(poly, (X) => k - (mx * X.x + my * X.y));
  }
  return dedupe(poly, 0.5);
}

/** Inward unit normals of a convex polygon's edges: m·X >= k inside. */
export function halfPlanes(poly: Pt[]): { mx: number; my: number; k: number }[] {
  const sgn = polySigned(poly) > 0 ? 1 : -1;
  const E: { mx: number; my: number; k: number }[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    let mx = -(q.y - p.y) * sgn;
    let my = (q.x - p.x) * sgn;
    const L = Math.hypot(mx, my);
    if (L < 1e-6) continue;
    mx /= L;
    my /= L;
    E.push({ mx, my, k: mx * p.x + my * p.y });
  }
  return E;
}

/** Largest axis-aligned rectangle inside a convex polygon (grid + pattern search, closed-form scale). */
export function inscribed(poly: Pt[]): Rect {
  if (poly.length < 3) return { x: 0, y: 0, w: 0, h: 0 };
  const E = halfPlanes(poly);
  // For centre (cx, cy) and aspect r = w/h, the biggest half-height s that fits.
  const fit = (cx: number, cy: number, r: number) => {
    let s = Infinity;
    for (const e of E) {
      const num = e.mx * cx + e.my * cy - e.k;
      if (num <= 0) return 0;
      const den = Math.abs(e.mx) * r + Math.abs(e.my);
      if (den > 1e-9) s = Math.min(s, num / den);
    }
    return s === Infinity ? 0 : s;
  };
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (const p of poly) {
    minx = Math.min(minx, p.x);
    maxx = Math.max(maxx, p.x);
    miny = Math.min(miny, p.y);
    maxy = Math.max(maxy, p.y);
  }
  const bw = maxx - minx;
  const bh = maxy - miny;
  const N = 9;
  const LR0 = Math.log(0.25);
  const LR1 = Math.log(4);
  let best = { a: -1, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, lr: 0 };
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const cx = minx + ((i + 0.5) / N) * bw;
      const cy = miny + ((j + 0.5) / N) * bh;
      for (const r of [0.3, 0.45, 0.65, 0.85, 1, 1.2, 1.55, 2.2, 3.2]) {
        const s = fit(cx, cy, r);
        const a = 4 * r * s * s;
        if (a > best.a) best = { a, cx, cy, lr: Math.log(r) };
      }
    }
  const unit = Math.max(bw, bh) / 1000;
  let st = [bw / N, bh / N, 0.3];
  for (let it = 0; it < 80 && (st[0] > unit || st[1] > unit || st[2] > 0.004); it++) {
    let moved = false;
    for (let dim = 0; dim < 3; dim++)
      for (const sg of [-1, 1]) {
        const c = { ...best };
        if (dim === 0) c.cx += sg * st[0];
        else if (dim === 1) c.cy += sg * st[1];
        else c.lr = clamp(c.lr + sg * st[2], LR0, LR1);
        const r = Math.exp(c.lr);
        const s = fit(c.cx, c.cy, r);
        const a = 4 * r * s * s;
        if (a > best.a + 1e-12) {
          c.a = a;
          best = c;
          moved = true;
        }
      }
    if (!moved) st = st.map((v) => v / 2);
  }
  const r = Math.exp(best.lr);
  const s = fit(best.cx, best.cy, r);
  return { x: best.cx - r * s, y: best.cy - s, w: 2 * r * s, h: 2 * s };
}

const FACING: Record<"top" | "right" | "bottom" | "left", Rotation> = {
  top: 180,
  right: 270,
  bottom: 0,
  left: 90,
};
const SIDES = ["top", "right", "bottom", "left"] as const;

/** Face the board edge nearest the content, preferring edges the cell actually touches. */
export function autoFace(poly: Pt[], rect: Rect, W: number, H: number): Rotation {
  const touch = { top: 0, right: 0, bottom: 0, left: 0 };
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    if (p.y < 1 && q.y < 1) touch.top += Math.abs(q.x - p.x);
    if (p.y > H - 1 && q.y > H - 1) touch.bottom += Math.abs(q.x - p.x);
    if (p.x < 1 && q.x < 1) touch.left += Math.abs(q.y - p.y);
    if (p.x > W - 1 && q.x > W - 1) touch.right += Math.abs(q.y - p.y);
  }
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const dd = { top: cy, bottom: H - cy, left: cx, right: W - cx };
  let sides: (typeof SIDES)[number][] = SIDES.filter((s) => touch[s] > 24);
  if (!sides.length) sides = [...SIDES];
  sides.sort((a, b) => dd[a] - dd[b]);
  return FACING[sides[0]];
}

export interface CellInfo {
  /** Inset polygon, board px. */
  poly: Pt[];
  area: number;
  /** Largest inscribed rectangle, board px: where the life face goes. */
  rect: Rect;
  /** The facing the cell gets when its seat has none of its own. */
  auto: Rotation;
  ok: boolean;
}

/** A raw cell made ready to draw on a W x H board. */
export function cellInfo(raw: Pt[], W: number, H: number, gap = CELL_GAP): CellInfo {
  const poly = raw.length >= 3 ? insetCell(raw, W, H, gap) : [];
  const area = polyArea(poly);
  const rect = area > 1 ? inscribed(poly) : { x: 0, y: 0, w: 0, h: 0 };
  const auto = area > 1 ? autoFace(poly, rect, W, H) : 0;
  return { poly, area, rect, auto, ok: area >= MIN_AREA && rect.w >= MIN_SIDE && rect.h >= MIN_SIDE };
}

/** Round a convex polygon's corners with quadratic arcs of radius ~R. */
export function roundPoly(poly: Pt[], R: number): Pt[] {
  const out: Pt[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const V = poly[i];
    const A = poly[(i - 1 + n) % n];
    const B = poly[(i + 1) % n];
    const la = dist(V, A);
    const lb = dist(V, B);
    if (la < 0.5 || lb < 0.5) {
      out.push(V);
      continue;
    }
    const ua = { x: (A.x - V.x) / la, y: (A.y - V.y) / la };
    const ub = { x: (B.x - V.x) / lb, y: (B.y - V.y) / lb };
    const th = Math.acos(clamp(ua.x * ub.x + ua.y * ub.y, -1, 1));
    if (th > Math.PI - 0.02) {
      out.push(V);
      continue;
    }
    const t = Math.min(R / Math.tan(th / 2), la / 2, lb / 2);
    const P1 = { x: V.x + ua.x * t, y: V.y + ua.y * t };
    const P2 = { x: V.x + ub.x * t, y: V.y + ub.y * t };
    for (let k = 0; k <= 6; k++) {
      const s = k / 6;
      const a = (1 - s) * (1 - s);
      const b = 2 * (1 - s) * s;
      const c = s * s;
      out.push({ x: a * P1.x + b * V.x + c * P2.x, y: a * P1.y + b * V.y + c * P2.y });
    }
  }
  return out;
}

/**
 * The point where cells meet that is nearest the board centre, in unit
 * coordinates: home for the menu hexagon. W x H is the board's shape, which
 * decides "nearest".
 */
export function cellJunction(raw: Pt[][], W = 1, H = 1): Pt {
  const c = { x: W / 2, y: H / 2 };
  let best: Pt | null = null;
  let bd = Infinity;
  const consider = (p: Pt) => {
    const d = dist(p, c);
    if (d < bd - 1e-9) {
      bd = d;
      best = p;
    }
  };
  const polys = raw.map((rp) => rp.map((p) => ({ x: p.x * W, y: p.y * H })));
  const e = Math.min(W, H) * 1e-4;
  for (const P of polys) for (const p of P) if (p.x > e && p.x < W - e && p.y > e && p.y < H - e) consider(p);
  if (!best) {
    // Only straight borders across the board (two seats): the nearest point on one.
    for (const P of polys)
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        const q = P[(i + 1) % P.length];
        const edge =
          (p.x < e && q.x < e) || (p.x > W - e && q.x > W - e) || (p.y < e && q.y < e) || (p.y > H - e && q.y > H - e);
        if (edge) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const L2 = dx * dx + dy * dy || 1;
        const s = clamp(((c.x - p.x) * dx + (c.y - p.y) * dy) / L2, 0, 1);
        consider({ x: p.x + dx * s, y: p.y + dy * s });
      }
  }
  const b: Pt = best ?? c;
  return { x: b.x / W, y: b.y / H };
}
