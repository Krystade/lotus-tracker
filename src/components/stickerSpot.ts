import { polyGeoms } from "../layout/freeform";
import { clearSpot, fitsAt, type Box } from "../layout/polyPlace";
import type { Pt } from "../layout/power";
import { startSpot } from "../game/stickers";
import type { LayoutConfig, StickerHold } from "../state/types";

/** styles.css .sticker at scale 1. */
const STICKER = 52;

/** The board on screen, and a seat's cell in it (board px), on a freeform layout. */
function boardAndCell(layout: LayoutConfig, holder: string) {
  if (!layout.cells?.length || typeof document === "undefined") return null;
  const board = document.querySelector<HTMLElement>(".board");
  if (!board) return null;
  const br = board.getBoundingClientRect();
  const W = br.width;
  const H = br.height;
  if (!(W > 0 && H > 0)) return null;
  const g = polyGeoms(layout.cells, W, H).get(holder);
  if (!g) return null;
  const poly: Pt[] = g.poly.map((p) => ({ x: p.x + g.box.x, y: p.y + g.box.y }));
  return { board, br, W, H, poly };
}

/**
 * What a sticker in `holder`'s cell keeps clear of, as rendered, in board
 * px: that tile's number, + / − signs, ⋯, timer, counters (and swing,
 * skull, winner), and the menu hexagon and clock.
 */
function seatBlocks(board: HTMLElement, br: DOMRect, holder: string): Box[] {
  const blocks: Box[] = [];
  const add = (r: DOMRect | undefined, pad = 0) => {
    if (r && r.width > 0 && r.height > 0)
      blocks.push({ x: r.left - br.left - pad, y: r.top - br.top - pad, w: r.width + 2 * pad, h: r.height + 2 * pad });
  };
  const tile = board.querySelector<HTMLElement>(`.tile[data-pid="${holder}"]`);
  if (tile) {
    const text = (el: Element) => {
      if (typeof document.createRange !== "function") return el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect?.() ?? el.getBoundingClientRect();
    };
    const life = tile.querySelector(".tile__life");
    if (life) add(text(life), 2);
    tile.querySelectorAll(".tile__sign").forEach((s) => add(text(s), 2));
    tile
      .querySelectorAll(".tile__more, .tile__pill, .tcount, .tile__swing, .tile__skull, .tile__winner")
      .forEach((e) => add(e.getBoundingClientRect()));
  }
  document.querySelectorAll(".center__hex, .center__clock").forEach((e) => add(e.getBoundingClientRect()));
  return blocks;
}

/**
 * Where a new sticker starts on a freeform seat, board fractions; null on a
 * grid layout (startSpot already knows its tiles) or when the board is not
 * on screen. A freeform cell's grid stand-in only approximates its face, so
 * startSpot's corner of it can sit on the life number or hang off the cell.
 * Instead: the nearest spot to that corner wholly inside the cell's actual
 * (rounded) polygon, clear of what is drawn there as rendered -- the number,
 * the + / − signs, ⋯, the timer, the counters -- and of the menu hexagon,
 * the clock and the other stickers. Everything in board px; a sticker is a
 * circle, so its box is the same whichever way it faces.
 */
export function freeStickerSpot(layout: LayoutConfig, holder: string): { x: number; y: number } | null {
  const at = boardAndCell(layout, holder);
  if (!at) return null;
  const { board, br, W, H, poly } = at;
  const blocks = seatBlocks(board, br, holder);
  document.querySelectorAll(".sticker").forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) blocks.push({ x: r.left - br.left, y: r.top - br.top, w: r.width, h: r.height });
  });
  const s = startSpot(layout, holder);
  const prefer = { x: s.x * W, y: s.y * H };
  const spot = clearSpot(poly, blocks, STICKER, STICKER, prefer) ?? clearSpot(poly, [], STICKER, STICKER, prefer);
  return spot ? { x: spot.x / W, y: spot.y / H } : null;
}

/**
 * After a freeform layout changes (a template, Edit layout, a turned seat, a
 * seat added or removed), a sticker kept its board spot or went by its
 * seat's grid stand-in, so it can sit outside its holder's cell or on what
 * is drawn there. With the new board drawn: a sticker wholly inside its
 * holder's cell and touching nothing freeStickerSpot keeps clear of, nor any
 * sticker already staying, stays exactly where it is, dragged there or not
 * (oldest first, so of two on top of each other the newer moves).
 * Every other one moves to the nearest spot that is clear of all that and of
 * those staying or already moved (failing that, just inside the cell).
 * Board fractions; [] on a grid layout.
 *
 * Stickers settle first and the turn timer follows them (it is placed clear
 * of stickers every render): this runs once per layout change, never because
 * the timer moved, so the two cannot chase each other.
 */
export function refitStickers(layout: LayoutConfig, stickers: StickerHold[]): { id: StickerHold["id"]; x: number; y: number; scale: number }[] {
  const seats = new Map<string, { W: number; H: number; poly: Pt[]; blocks: Box[] } | null>();
  const seat = (holder: string) => {
    if (!seats.has(holder)) {
      const c = boardAndCell(layout, holder);
      seats.set(holder, c && { W: c.W, H: c.H, poly: c.poly, blocks: seatBlocks(c.board, c.br, holder) });
    }
    return seats.get(holder)!;
  };
  const sq = (x: number, y: number, d: number): Box => ({ x: x - d / 2, y: y - d / 2, w: d, h: d });
  // Board px of the stickers staying put, then of those moved, as decided.
  const placed: Box[] = [];
  const later: StickerHold[] = [];
  for (const s of stickers) {
    const c = seat(s.holder);
    if (!c) continue;
    const d = STICKER * s.scale;
    const here = { x: s.x * c.W, y: s.y * c.H };
    if (fitsAt(c.poly, [...c.blocks, ...placed], d, d, here)) placed.push(sq(here.x, here.y, d));
    else later.push(s);
  }
  const moves: { id: StickerHold["id"]; x: number; y: number; scale: number }[] = [];
  for (const s of later) {
    const c = seat(s.holder)!;
    const d = STICKER * s.scale;
    const here = { x: s.x * c.W, y: s.y * c.H };
    const spot = clearSpot(c.poly, [...c.blocks, ...placed], d, d, here) ?? clearSpot(c.poly, [], d, d, here);
    const to = spot ?? here;
    placed.push(sq(to.x, to.y, d));
    if (spot?.moved) moves.push({ id: s.id, x: spot.x / c.W, y: spot.y / c.H, scale: s.scale });
  }
  return moves;
}
