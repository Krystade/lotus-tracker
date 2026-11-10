import { polyGeoms } from "../layout/freeform";
import { clearSpot, type Box } from "../layout/polyPlace";
import { startSpot } from "../game/stickers";
import type { LayoutConfig } from "../state/types";

/** styles.css .sticker at scale 1. */
const STICKER = 52;

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
  if (!layout.cells?.length || typeof document === "undefined") return null;
  const board = document.querySelector<HTMLElement>(".board");
  if (!board) return null;
  const br = board.getBoundingClientRect();
  const W = br.width;
  const H = br.height;
  if (!(W > 0 && H > 0)) return null;
  const g = polyGeoms(layout.cells, W, H).get(holder);
  if (!g) return null;
  const poly = g.poly.map((p) => ({ x: p.x + g.box.x, y: p.y + g.box.y }));
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
  document.querySelectorAll(".center__hex, .center__clock, .sticker").forEach((e) => add(e.getBoundingClientRect()));
  const s = startSpot(layout, holder);
  const prefer = { x: s.x * W, y: s.y * H };
  const spot = clearSpot(poly, blocks, STICKER, STICKER, prefer) ?? clearSpot(poly, [], STICKER, STICKER, prefer);
  return spot ? { x: spot.x / W, y: spot.y / H } : null;
}
