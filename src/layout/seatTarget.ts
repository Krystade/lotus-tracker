import type { Move, MovePlan, PxRect, Side } from "./table";
import { pxRects } from "./table";

/** What letting go here would do, while a seat is being dragged. */
export type SeatTarget =
  | { kind: "none" }
  | { kind: "home" }
  | { kind: "locked"; side: Side }
  | { kind: "swap"; with: string }
  | { kind: "move"; move: Move };

export const DEPART_PX = 24;
export const DISC_R = 40;
export const DISC_KEEP_R = 48;
export const END_ZONE_PX = 88;

export interface PickInput {
  pid: string;
  /** Finger and arm point, in px relative to the board's top-left. */
  x: number;
  y: number;
  armX: number;
  armY: number;
  /** The finger has been DEPART_PX from the arm point at least once. */
  departed: boolean;
  /** The finger has left the end zone it armed inside. */
  leftArmZone: boolean;
  W: number;
  H: number;
  gap: number;
  /** Tiles as they stand now (frozen when the drag armed). */
  rects: Record<string, PxRect>;
  plan: MovePlan;
  current: SeatTarget;
}

const centre = (r: PxRect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const inside = (r: PxRect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const distTo = (r: PxRect, x: number, y: number) =>
  Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));

/** Where the dragged seat itself would land for a move, in px. */
export function moveRect(m: Move, pid: string, W: number, H: number, gap: number): PxRect {
  return pxRects(m.grid, W, H, gap)[pid];
}

export function inEndZone(y: number, H: number): "top" | "bottom" | null {
  if (y < END_ZONE_PX) return "top";
  if (y > H - END_ZONE_PX) return "bottom";
  return null;
}

/** Decide the drop target for one finger position. Pure, for tests. */
export function pickTarget(i: PickInput): SeatTarget {
  const { pid, x, y, rects, plan, W, H, gap } = i;
  if (!i.departed && Math.hypot(x - i.armX, y - i.armY) < DEPART_PX) return { kind: "none" };

  // 1. Swap discs at the other tiles' centres; a little stickier once in.
  for (const [id, r] of Object.entries(rects)) {
    if (id === pid) continue;
    const c = centre(r);
    const keep = i.current.kind === "swap" && i.current.with === id;
    if (Math.hypot(x - c.x, y - c.y) < (keep ? DISC_KEEP_R : DISC_R)) return { kind: "swap", with: id };
  }
  const own = rects[pid];
  if (own) {
    const c = centre(own);
    if (Math.hypot(x - c.x, y - c.y) < DISC_R) return { kind: "home" };
  }

  // 2. The head and foot. A handle armed inside an end zone has to push on
  //    towards that edge (or leave and come back) before the end counts.
  const armZone = inEndZone(i.armY, H);
  const zone = inEndZone(y, H);
  const zoneOk =
    zone &&
    (zone !== armZone ||
      i.leftArmZone ||
      (zone === "top" ? y < i.armY - DEPART_PX : y > i.armY + DEPART_PX));
  if (zone && zoneOk) {
    if (plan.locked[zone]) return { kind: "locked", side: zone };
    const ends = plan.moves.filter(
      (m) => (m.kind === "slot" && m.side === zone) || (m.kind === "strip" && m.edge === zone),
    );
    const best = nearest(ends, pid, x, y, W, H, gap);
    if (best) return { kind: "move", move: best };
    return { kind: "none" };
  }

  // 3. Elsewhere on the board.
  if (plan.table) {
    const side: Side = x < W / 2 ? "left" : "right";
    const opts = plan.moves.filter((m) => m.kind === "slot" && m.side === side);
    const best = nearest(opts, pid, x, y, W, H, gap);
    if (own && inside(own, x, y) && (!best || !inside(moveRect(best, pid, W, H, gap), x, y))) {
      return { kind: "home" };
    }
    return best ? { kind: "move", move: best } : own && inside(own, x, y) ? { kind: "home" } : { kind: "none" };
  }

  // A Customize layout: split the tile under the finger on its nearest edge.
  const over = Object.entries(rects).find(([, r]) => inside(r, x, y));
  if (!over) return i.current;
  const [qid, r] = over;
  if (qid === pid) return { kind: "home" };
  const u = (x - r.x) / r.w;
  const v = (y - r.y) / r.h;
  const edges: [Side, number][] = [
    ["top", v],
    ["right", 1 - u],
    ["bottom", 1 - v],
    ["left", u],
  ];
  edges.sort((a, b) => a[1] - b[1]);
  for (const [edge] of edges.slice(0, 2)) {
    const m = plan.moves.find((mv) => mv.kind === "split" && mv.target === qid && mv.edge === edge);
    if (m) return { kind: "move", move: m };
  }
  return { kind: "none" };
}

function nearest(ms: Move[], pid: string, x: number, y: number, W: number, H: number, gap: number): Move | null {
  let best: Move | null = null;
  let bd = Infinity;
  for (const m of ms) {
    const d = distTo(moveRect(m, pid, W, H, gap), x, y);
    if (d < bd - 1e-6) {
      bd = d;
      best = m;
    }
  }
  return best;
}
