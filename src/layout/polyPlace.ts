import { halfPlanes, type Pt } from "./power";

/**
 * Free spots inside a freeform cell. A narrow cell's face (its largest
 * inscribed rectangle) has no spare corner: the ⋯ button lands on a + / −
 * sign and the turn timer on the life number. The cell has room outside its
 * face, so these move to the nearest clear spot inside the polygon. Ported
 * from the layout-editor prototype's placeMore. Everything works in the
 * face's own (rotated) frame, so a result is a plain left/top on the element.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const boxOf = (pts: Pt[]): Box => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

/**
 * The face's own frame: (0, 0) at its top-left as its player reads it.
 * `face` is in the same coordinates as the points later passed to toLocal;
 * `rotation` is the content box's CSS rotation (0/90/180/270).
 */
export function faceFrame(face: Box, rotation: number) {
  const turned = rotation === 90 || rotation === 270;
  const sw = turned ? face.h : face.w;
  const sh = turned ? face.w : face.h;
  const a = (rotation * Math.PI) / 180;
  const cos = Math.round(Math.cos(a));
  const sin = Math.round(Math.sin(a));
  const cx = face.x + face.w / 2;
  const cy = face.y + face.h / 2;
  const toLocal = (p: Pt): Pt => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return { x: dx * cos + dy * sin + sw / 2, y: -dx * sin + dy * cos + sh / 2 };
  };
  return { sw, sh, toLocal };
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Centre for a w×h element inside the convex `poly`, clear of `blocks`.
 * `prefer` (its usual spot) wins if it already fits; otherwise the nearest
 * fitting point on a 4px grid. null when nothing fits (keep the usual spot).
 */
export function clearSpot(
  poly: Pt[],
  blocks: Box[],
  w: number,
  h: number,
  prefer: Pt,
): { x: number; y: number; moved: boolean } | null {
  if (poly.length < 3) return null;
  const E = halfPlanes(poly);
  const fits = (cx: number, cy: number, edge: number, pad: number) => {
    const x0 = cx - w / 2;
    const y0 = cy - h / 2;
    for (const [x, y] of [[x0, y0], [x0 + w, y0], [x0, y0 + h], [x0 + w, y0 + h]])
      if (!E.every((e) => e.mx * x + e.my * y - e.k >= edge)) return false;
    const me = { x: x0 - pad, y: y0 - pad, w: w + 2 * pad, h: h + 2 * pad };
    return !blocks.some((b) => overlaps(me, b));
  };
  if (fits(prefer.x, prefer.y, 1, 2)) return { x: prefer.x, y: prefer.y, moved: false };
  const bb = boxOf(poly);
  let best: Pt | null = null;
  let bd = Infinity;
  for (let y = bb.y + h / 2; y <= bb.y + bb.h - h / 2; y += 4)
    for (let x = bb.x + w / 2; x <= bb.x + bb.w - w / 2; x += 4) {
      const d = (x - prefer.x) ** 2 + (y - prefer.y) ** 2;
      if (d < bd && fits(x, y, 5, 4)) {
        bd = d;
        best = { x, y };
      }
    }
  return best ? { ...best, moved: true } : null;
}
