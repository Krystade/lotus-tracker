import type { LayoutConfig, Placement, StickerHold, StickerId } from "../state/types";
import { HUB_REACH, boardHub, junctionFor } from "../layout/junction";

export interface StickerDef {
  id: StickerId;
  icon: string;
  name: string;
}

/** Shared markers that sit with one player at a time and change hands. */
export const STICKERS: StickerDef[] = [
  { id: "monarch", icon: "👑", name: "Monarch" },
  { id: "initiative", icon: "🏰", name: "Initiative" },
  { id: "blessing", icon: "🏙️", name: "City's Blessing" },
  { id: "ring", icon: "💍", name: "The Ring" },
];

export const stickerDef = (id: StickerId): StickerDef =>
  STICKERS.find((s) => s.id === id) ?? STICKERS[0];

const IDS = new Set<string>(STICKERS.map((s) => s.id));

export const MIN_SCALE = 0.6;
export const MAX_SCALE = 4;

type Grid = Pick<LayoutConfig, "rows" | "cols" | "placements">;

/** The seat whose tile covers this point of the board, if any. */
export function seatAt(layout: Grid, fx: number, fy: number): Placement | null {
  const col = fx * layout.cols;
  const row = fy * layout.rows;
  return (
    layout.placements.find(
      (p) =>
        col >= p.col - 1 &&
        col < p.col - 1 + p.colSpan &&
        row >= p.row - 1 &&
        row < p.row - 1 + p.rowSpan,
    ) ?? null
  );
}

/** Centre of a seat's tile, as board fractions. */
export function tileCentre(layout: Grid, playerId: string): { x: number; y: number } {
  const p = layout.placements.find((q) => q.playerId === playerId);
  if (!p) return { x: 0.5, y: 0.5 };
  return {
    x: (p.col - 1 + p.colSpan / 2) / layout.cols,
    y: (p.row - 1 + p.rowSpan / 2) / layout.rows,
  };
}

/** Put a sticker on the table at the centre of a seat, or take it off with null. */
export function giveSticker(
  stickers: StickerHold[],
  layout: Grid,
  id: StickerId,
  holder: string | null,
): StickerHold[] {
  const rest = stickers.filter((s) => s.id !== id);
  if (!holder) return rest;
  return [...rest, { id, holder, ...startSpot(layout, holder), scale: 1 }];
}

/**
 * Where a new sticker goes: one of the player's two upper corners, whichever
 * is further from where the tiles meet -- that corner is where the
 * centre-corner turn timer lives, and a sticker over it would eat the tap
 * that passes the turn.
 */
function startSpot(layout: Grid, holder: string): { x: number; y: number } {
  // Inset from the corner so the seat handle there stays uncovered; where
  // the handle slid along the edge past the hub, it sits right above that
  // spot, so start lower.
  const { side, push } = seatHandleSpot(layout, holder);
  return tileSpot(layout, holder, side === "left" ? 0.3 : 0.7, push ? 0.45 : 0.3);
}

/**
 * Which of a player's two upper corners (as they sit) is further from where
 * the tiles meet. The turn timer owns the near one; the seat handle the far.
 * Where the tiles meet partway along the player's own top edge, the corner
 * timer is a half disc to the right of that point (see PlayerTile's
 * cornerTimer), so the left corner is the free one wherever the point is.
 */
export function farTopCorner(layout: Grid, holder: string): "left" | "right" {
  const a = tileSpot(layout, holder, 0.1, 0.1);
  const b = tileSpot(layout, holder, 0.9, 0.1);
  const p = layout.placements.find((q) => q.playerId === holder);
  const j = junctionFor(layout, holder);
  if (!p || !j) return "left";
  const jx = (p.col - 1 + j.fx * p.colSpan) / layout.cols;
  const jy = (p.row - 1 + j.fy * p.rowSpan) / layout.rows;
  const { lx, ly } = localSpot(layout, holder, jx, jy);
  if (Math.abs(ly) < 1e-9 && lx > 1e-9 && lx < 1 - 1e-9) return "left";
  const far = (q: { x: number; y: number }) => Math.hypot(q.x - jx, q.y - jy);
  return far(b) > far(a) + 1e-9 ? "right" : "left";
}

/**
 * Where a seat's handle sits, beyond the top corner farTopCorner picks: kept
 * clear of the menu hexagon and the game clock under it, which sit on the
 * board's hub. Only a hub on the line of the seat's own top edge can reach
 * the handle there (anywhere else it is half a cell or more away):
 *
 * - on or behind the handle's corner -- the timer has the other corner and
 *   the hub this one, as in a 4x2 with three seats down one side -- the
 *   handle slides along the edge, `push.px` less `push.behind` of the seat's
 *   width (--lw) from the corner, past the hexagon and clock;
 * - partway along the edge, `room` caps the handle's size at `room.ahead` of
 *   the width less `room.px`, so it ends before the clock or hexagon starts.
 *
 * The px are how far the hexagon and clock reach that way on screen.
 */
export interface SeatHandleSpot {
  side: "left" | "right";
  push?: { px: number; behind: number };
  room?: { px: number; ahead: number };
}

/** The handle's inset from its corner, both ways (styles.css .tile__seat). */
const HANDLE_INSET = 5;

export function seatHandleSpot(layout: Grid, holder: string): SeatHandleSpot {
  const side = farTopCorner(layout, holder);
  const p = layout.placements.find((q) => q.playerId === holder);
  if (!p) return { side };
  const hub = boardHub(layout);
  const { lx, ly } = localSpot(layout, holder, hub.x, hub.y);
  if (Math.abs(ly) > 1e-9) return { side };
  // From the handle's corner along the top edge, in fractions of the width.
  const ahead = side === "left" ? lx : 1 - lx;
  if (ahead >= 1 - 1e-9) return { side };
  // The handle runs from its corner along the top edge: +x from the left
  // corner, -x from the right one. Which way is that on screen?
  const screen = (along: 1 | -1): keyof typeof HUB_REACH =>
    p.rotation === 90 ? (along > 0 ? "down" : "up")
    : p.rotation === 180 ? (along > 0 ? "left" : "right")
    : p.rotation === 270 ? (along > 0 ? "up" : "down")
    : along > 0 ? "right" : "left";
  const away = side === "left" ? 1 : -1;
  if (ahead <= 1e-9) return { side, push: { px: HUB_REACH[screen(away)], behind: Math.max(0, -ahead) } };
  return { side, room: { px: HUB_REACH[screen(away === 1 ? -1 : 1)] + HANDLE_INSET, ahead } };
}

/**
 * A point on a seat's tile in that player's own frame -- (0,0) their top-left
 * as they sit, (1,1) their bottom-right -- as board fractions. New stickers
 * start in the player's upper-left, off the life total in the middle and the
 * counters along the bottom.
 */
export function tileSpot(
  layout: Grid,
  playerId: string,
  lx: number,
  ly: number,
): { x: number; y: number } {
  const p = layout.placements.find((q) => q.playerId === playerId);
  if (!p) return { x: 0.5, y: 0.5 };
  const { x: cx, y: cy } = tileCentre(layout, playerId);
  const w = p.colSpan / layout.cols;
  const h = p.rowSpan / layout.rows;
  const dx = lx - 0.5;
  const dy = ly - 0.5;
  // The tile's own axes, turned to where they point on screen.
  switch (p.rotation) {
    case 90:
      return { x: cx - dy * w, y: cy + dx * h };
    case 180:
      return { x: cx - dx * w, y: cy - dy * h };
    case 270:
      return { x: cx + dy * w, y: cy - dx * h };
    default:
      return { x: cx + dx * w, y: cy + dy * h };
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Move and/or resize a sticker. Its holder becomes whoever's tile it now sits
 * over; dropped on the gap between tiles, it stays with whoever had it.
 */
export function placeSticker(
  stickers: StickerHold[],
  layout: Grid,
  id: StickerId,
  pos: { x: number; y: number; scale: number },
): StickerHold[] {
  return stickers.map((s) => {
    if (s.id !== id) return s;
    const x = clamp(pos.x, 0, 1);
    const y = clamp(pos.y, 0, 1);
    const seat = seatAt(layout, x, y);
    return { ...s, x, y, scale: clamp(pos.scale, MIN_SCALE, MAX_SCALE), holder: seat?.playerId ?? s.holder };
  });
}

/** Drop anything malformed, unknown, duplicated or held by a missing seat. */
export function sanitizeStickers(v: unknown, seats: Set<string>, layout: Grid): StickerHold[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: StickerHold[] = [];
  for (const raw of v) {
    const s = raw as Partial<StickerHold> | null;
    if (!s || typeof s.id !== "string" || typeof s.holder !== "string") continue;
    if (!IDS.has(s.id) || !seats.has(s.holder) || seen.has(s.id)) continue;
    seen.add(s.id);
    // Saved before stickers could be placed: start them on their holder.
    const home = tileCentre(layout, s.holder);
    const fin = (n: unknown, d: number) => (typeof n === "number" && Number.isFinite(n) ? n : d);
    out.push({
      id: s.id as StickerId,
      holder: s.holder,
      x: clamp(fin(s.x, home.x), 0, 1),
      y: clamp(fin(s.y, home.y), 0, 1),
      scale: clamp(fin(s.scale, 1), MIN_SCALE, MAX_SCALE),
    });
  }
  return out;
}

/** The inverse of tileSpot: a board point in a seat's own frame. */
export function localSpot(
  layout: Grid,
  playerId: string,
  x: number,
  y: number,
): { lx: number; ly: number } {
  const p = layout.placements.find((q) => q.playerId === playerId);
  if (!p) return { lx: 0.5, ly: 0.5 };
  const { x: cx, y: cy } = tileCentre(layout, playerId);
  const w = p.colSpan / layout.cols;
  const h = p.rowSpan / layout.rows;
  const ex = x - cx;
  const ey = y - cy;
  switch (p.rotation) {
    case 90:
      return { lx: 0.5 + ey / h, ly: 0.5 - ex / w };
    case 180:
      return { lx: 0.5 - ex / w, ly: 0.5 - ey / h };
    case 270:
      return { lx: 0.5 - ey / h, ly: 0.5 + ex / w };
    default:
      return { lx: 0.5 + ex / w, ly: 0.5 + ey / h };
  }
}

/** After the seats move, each sticker keeps its spot on its holder's tile. */
export function remapStickers(stickers: StickerHold[], from: Grid, to: Grid): StickerHold[] {
  return stickers.map((s) => {
    const { lx, ly } = localSpot(from, s.holder, s.x, s.y);
    const at = tileSpot(to, s.holder, clamp(lx, 0, 1), clamp(ly, 0, 1));
    return { ...s, x: clamp(at.x, 0, 1), y: clamp(at.y, 0, 1) };
  });
}
