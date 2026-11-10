import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { useStore } from "../state/store";
import { useHoldRepeat } from "../hooks/useHoldRepeat";
import { formatClock } from "../util/format";
import { clampLife } from "../game/life";
import { isCommanderDamageLethal, isPoisonLethal } from "../game/lethal";
import { textOn } from "../layout/colors";
import { resolveLook } from "../layout/looks";
import { useLifeFeedback } from "../hooks/useLifeFeedback";
import { CounterSteppers } from "./CounterSteppers";
import { Digits } from "./Digits";
import { ArcadeTile } from "./ArcadeTile";
import { HUB_REACH, junctionFor, type TileJunction } from "../layout/junction";
import { boxOf, clearSpot, faceFrame, type Box } from "../layout/polyPlace";
import { seatHandleSpot, type SeatHandleSpot } from "../game/stickers";
import { startSeatDrag, useSeatUi } from "./seatDrag";
import { screenToLocal, usePillGesture } from "./usePillGesture";
import { warnLevel } from "../game/turn";
import type { Placement, Rotation, StickerHold, TilePos } from "../state/types";
import type { PolyGeom } from "../layout/freeform";

interface Props {
  placement: Placement;
  onOpenDetail: (playerId: string) => void;
  /** This seat has the pass-the-time games open over its tile. */
  arcadeOpen: boolean;
  onCloseArcade: () => void;
  boardRef?: React.RefObject<HTMLDivElement>;
  /**
   * Freeform layouts: the tile is its cell's bounding box clipped to the
   * polygon, and everything that sits on a tile (life, +/-, timer, counters)
   * goes in the cell's largest inscribed rectangle. No seat-move handle here.
   */
  cell?: PolyGeom;
}

// Sits just above the counter-chip row that owns the bottom edge. Still
// draggable anywhere; this is only where it starts.
const DEFAULT_TIMER_POS: TilePos = { x: 50, y: 76 };

// Corner timer at the board's middle: the menu hexagon and the game clock
// under it sit on the disc's centre, so the face sits this far out from it
// along the diagonal, clear of the hexagon (27px) and the clock.
const HEX_HOLE = 50;
// How far the seat handle (styles.css .tile__seat) reaches from its corner along the edge, plus air.
const SEAT_HANDLE_REACH = 5 + 44 + 4;

const LOCAL_TO_SCREEN: Record<Rotation, Rotation> = { 0: 0, 90: 270, 180: 180, 270: 90 };

/** The seat handle clear of the menu hexagon and clock (see seatHandleSpot). */
function handleStyle(h: SeatHandleSpot): CSSProperties | undefined {
  if (h.push) return { "--seat-at": `max(5px, calc(${h.push.px}px - ${h.push.behind} * var(--lw)))` } as CSSProperties;
  if (h.room) return { "--seat-room": `calc(${h.room.ahead} * var(--lw) - ${h.room.px}px)` } as CSSProperties;
  return undefined;
}

/** `calc()` for a length of `pct`% of the box plus `gaps` grid gaps. */
const at = (pct: number, gaps: number) => `calc(${pct}% + ${gaps} * var(--gap))`;

/**
 * "corner" mode: the timer is a disc centred exactly on the point of the
 * tile's border where the most seats meet -- the middle of the grid gap
 * there, which in every built-in is the hub under the menu hexagon. The
 * tile clips it to its own share: a quarter disc where that point is the
 * tile's corner, a half disc where it is the middle of an edge (a seat
 * spanning the board, head to head with the others). The box reaches half
 * a gap past the tile's edge so its centre is the point itself.
 * Everything here is in the tile's own (rotated) frame.
 */
function cornerTimer(j: TileJunction, rot: Rotation) {
  const [ax, ay] = screenToLocal(rot, j.fx - 0.5, j.fy - 0.5);
  const [dx, dy] = screenToLocal(rot, j.sx, j.sy).map(Math.sign) as [number, number];
  // The centre: px% / py% of the box plus gx / gy grid gaps, local axes.
  const px = Math.round((0.5 + ax) * 1e4) / 100;
  const py = Math.round((0.5 + ay) * 1e4) / 100;
  const [gx, gy] = screenToLocal(rot, j.gx, j.gy);
  if (dx !== 0 && dy !== 0) {
    // A corner: (dx, dy) points from it into the tile.
    const from = dx > 0 ? (dy > 0 ? 90 : 0) : dy > 0 ? 180 : 270;
    return {
      kind: "quarter" as const,
      style: {
        left: dx > 0 ? at(0, gx) : "auto",
        right: dx < 0 ? at(0, -gx) : "auto",
        top: dy > 0 ? at(0, gy) : "auto",
        bottom: dy < 0 ? at(0, -gy) : "auto",
        "--cx": dx > 0 ? "0%" : "100%",
        "--cy": dy > 0 ? "0%" : "100%",
        "--from": `${from}deg`,
        "--sweep": "90deg",
        // Where the corner is the middle of the board, the menu hexagon and
        // game clock sit on it: the disc grows by that much and the face
        // sits out past them.
        "--hole": j.atCenter ? `${HEX_HOLE}px` : "0px",
        // The face is centred on the diagonal, halfway between the hole
        // and the curve: padded on the two sides that meet at the corner.
        "--pl": dx > 0 ? "var(--pdx)" : "0.4em",
        "--pr": dx < 0 ? "var(--pdx)" : "0.4em",
        "--pt": dy > 0 ? "var(--pdy)" : "0.4em",
        "--pb": dy < 0 ? "var(--pdy)" : "0.4em",
        // Round only the inner corner, the one facing back into the tile.
        borderRadius:
          dx > 0 && dy > 0 ? "0 0 100% 0"
          : dx < 0 && dy > 0 ? "0 0 0 100%"
          : dx < 0 && dy < 0 ? "100% 0 0 0"
          : "0 100% 0 0",
        "--jh": dx > 0 ? "flex-start" : "flex-end",
        "--jv": dy > 0 ? "flex-start" : "flex-end",
      } as unknown as CSSProperties,
    };
  }
  // Middle of an edge: a half disc centred on it, flush against that edge.
  const hugY = dy !== 0;
  const into = hugY ? dy : dx;
  // At the hub the hexagon and clock sit on the centre, so the face goes
  // out past them, into the tile: as far as they reach that way on screen.
  const [sx, sy] = screenToLocal(LOCAL_TO_SCREEN[rot], hugY ? 0 : into, hugY ? into : 0);
  const hole = !j.atCenter
    ? 0
    : sx > 0 ? HUB_REACH.right : sx < 0 ? HUB_REACH.left : sy > 0 ? HUB_REACH.down : HUB_REACH.up;
  // Along the edge the disc must stay on the tile both ways, and end before
  // the seat handle in the top-left corner (5px inset, up to 44px, 4px air)
  // where the edge it hugs runs to that corner.
  const [along, alongGaps, side] = hugY ? [px, gx, "var(--lw)"] : [py, gy, "var(--lh)"];
  const handle = into > 0 ? SEAT_HANDLE_REACH : 0;
  const room = `min(calc(${along / 100} * ${side} + ${alongGaps} * var(--gap) - ${handle}px), calc(${1 - along / 100} * ${side} - ${alongGaps} * var(--gap)))`;
  const flush = hugY ? (into > 0 ? at(0, gy) : at(0, -gy)) : into > 0 ? at(0, gx) : at(0, -gx);
  const from = hugY ? (into > 0 ? 90 : 270) : into > 0 ? 0 : 180;
  const pad = `${hole}px`;
  return {
    kind: "half" as const,
    style: {
      ...(hugY
        ? { left: `calc(${along}% + ${alongGaps} * var(--gap) - var(--r))`, [into > 0 ? "top" : "bottom"]: flush }
        : { top: `calc(${along}% + ${alongGaps} * var(--gap) - var(--r))`, [into > 0 ? "left" : "right"]: flush }),
      "--hole": pad,
      "--room": room,
      "--cx": hugY ? "50%" : into > 0 ? "0%" : "100%",
      "--cy": hugY ? (into > 0 ? "0%" : "100%") : "50%",
      "--from": `${from}deg`,
      "--sweep": "180deg",
      // The face is centred in the band between the hole and the rim.
      "--pt": hugY && into > 0 ? pad : "0.4em",
      "--pb": hugY && into < 0 ? pad : "0.4em",
      "--pl": !hugY && into > 0 ? pad : "0.4em",
      "--pr": !hugY && into < 0 ? pad : "0.4em",
      borderRadius: hugY
        ? into > 0 ? "0 0 999px 999px" : "999px 999px 0 0"
        : into > 0 ? "0 999px 999px 0" : "999px 0 0 999px",
      "--jh": hugY ? "center" : into > 0 ? "flex-start" : "flex-end",
      "--jv": hugY ? (into > 0 ? "flex-start" : "flex-end") : "center",
    } as unknown as CSSProperties,
    hugY,
  };
}

const NO_STICKERS: StickerHold[] = [];

let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, el: Element): number {
  if (measureCtx === undefined) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return 0;
  const cs = getComputedStyle(el);
  measureCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return measureCtx.measureText(text).width;
}

/** Where ⋯ (left/top px) and the auto-placed timer (x/y % of the face) go in a freeform cell; null = usual spot. */
interface PolySpots {
  more: { x: number; y: number } | null;
  pill: { x: number; y: number } | null;
}
const sameSpot = (a: { x: number; y: number } | null, b: { x: number; y: number } | null) =>
  a === b || (!!a && !!b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5);

/**
 * A narrow freeform cell's face has no free corner, so ⋯ would sit on a + / −
 * sign and the timer against the life number. The cell has room outside its
 * face: move each to the nearest clear spot inside the polygon, clear of the
 * number, the signs and the menu hexagon (the timer also of ⋯, the counter
 * row and the stickers -- as stored, so a sticker mid-drag does not chase it;
 * if no spot clears the stickers too, it lets them be). Measured in the
 * face's own frame from the rendered sizes.
 *
 * Stickers settle first and the timer follows: a sticker is placed (added,
 * or re-placed after a layout change) once, against the timer where it is
 * then; the timer is placed every render, clear of the stickers. Nothing
 * moves a sticker because the timer moved, so the two never chase each other.
 */
function polySpots(
  cell: PolyGeom,
  rotation: Rotation,
  content: HTMLElement,
  life: string,
  autoPill: boolean,
  stickers: StickerHold[],
): PolySpots {
  const { sw, sh, toLocal } = faceFrame(cell.face, rotation);
  const poly = cell.poly.map(toLocal);
  const blocks: Box[] = [];
  const lifeEl = content.querySelector<HTMLElement>(".tile__life");
  const lh = lifeEl ? lifeEl.offsetHeight : sh;
  if (lifeEl) {
    const fs = parseFloat(getComputedStyle(lifeEl).fontSize) || 0;
    const nw = textWidth(life, lifeEl) * 1.1;
    const nh = fs * 1.06;
    blocks.push({ x: sw / 2 - nw / 2, y: lh / 2 - nh / 2 + 0.03 * fs, w: nw, h: nh });
  }
  const sign = content.querySelector<HTMLElement>(".tile__sign");
  if (sign) {
    const sf = parseFloat(getComputedStyle(sign).fontSize) || 0;
    const gw = textWidth("+", sign) * 1.1;
    blocks.push({ x: 0.07 * sw, y: sh / 2 - sf / 2, w: gw, h: sf }, { x: 0.93 * sw - gw, y: sh / 2 - sf / 2, w: gw, h: sf });
  }
  // The same, as rendered (the text's own box, the 6/9 underline, the sign
  // spans), mapped back from the screen into the face's frame.
  const cr = content.getBoundingClientRect();
  const scr = faceFrame({ x: cr.left, y: cr.top, w: cr.width, h: cr.height }, rotation).toLocal;
  const local = (r: Pick<DOMRect, "left" | "top" | "right" | "bottom">, pad = 0): Box => {
    const b = boxOf([scr({ x: r.left, y: r.top }), scr({ x: r.right, y: r.bottom })]);
    return { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
  };
  if (lifeEl && typeof document.createRange === "function") {
    const range = document.createRange();
    range.selectNodeContents(lifeEl);
    const r = range.getBoundingClientRect?.();
    if (r && r.width > 0) blocks.push(local(r));
    lifeEl.querySelectorAll(".digit--ambiguous").forEach((d) => blocks.push(local(d.getBoundingClientRect(), 4)));
  }
  content.querySelectorAll(".tile__sign").forEach((g) => {
    const r = g.getBoundingClientRect();
    if (r.width > 0) blocks.push(local(r));
  });
  if (cell.hub) {
    const h = cell.hub;
    blocks.push(
      boxOf(
        [
          { x: h.x - HUB_REACH.left, y: h.y - HUB_REACH.up },
          { x: h.x + HUB_REACH.right, y: h.y - HUB_REACH.up },
          { x: h.x - HUB_REACH.left, y: h.y + HUB_REACH.down },
          { x: h.x + HUB_REACH.right, y: h.y + HUB_REACH.down },
        ].map(toLocal),
      ),
    );
  }
  let more: PolySpots["more"] = null;
  let moreBox: Box | null = null;
  const moreEl = content.querySelector<HTMLElement>(".tile__more");
  if (moreEl) {
    const w = moreEl.offsetWidth;
    const h = moreEl.offsetHeight;
    // Its CSS spot: bottom 6px, right 10px.
    const prefer = { x: sw - 10 - w / 2, y: sh - 6 - h / 2 };
    const spot = clearSpot(poly, blocks, w, h, prefer);
    const c = spot ?? prefer;
    moreBox = { x: c.x - w / 2, y: c.y - h / 2, w, h };
    if (spot?.moved) more = { x: c.x - w / 2, y: c.y - h / 2 };
  }
  let pill: PolySpots["pill"] = null;
  const pillEl = content.querySelector<HTMLElement>(".tile__pill");
  if (autoPill && pillEl) {
    const w = pillEl.offsetWidth;
    const h = pillEl.offsetHeight;
    const rowH = sh - lh;
    const pb = [...blocks];
    if (moreBox) pb.push(moreBox);
    if (rowH > 1) pb.push({ x: 0, y: lh, w: sw, h: rowH });
    // The stickers, from the store (board fractions; styles.css .sticker is 52px at scale 1).
    const bd = content.closest(".board")?.getBoundingClientRect();
    const sb = bd
      ? stickers.map((t) => {
          const d = 52 * t.scale;
          const x = bd.left + t.x * bd.width;
          const y = bd.top + t.y * bd.height;
          return local({ left: x - d / 2, top: y - d / 2, right: x + d / 2, bottom: y + d / 2 });
        })
      : [];
    const prefer = { x: (DEFAULT_TIMER_POS.x / 100) * sw, y: (DEFAULT_TIMER_POS.y / 100) * sh };
    const spot = (sb.length ? clearSpot(poly, [...pb, ...sb], w, h, prefer) : null) ?? clearSpot(poly, pb, w, h, prefer);
    if (spot?.moved) pill = { x: (spot.x / sw) * 100, y: (spot.y / sh) * 100 };
  }
  return { more, pill };
}

/**
 * A grid tile's face is the whole tile, but its default timer spot (just
 * above the counter row) lands on the life number wherever the number fills
 * the tile -- every rotated seat, most of all. Same search as a freeform
 * cell: the nearest spot inside the face clear of the number's ink, the
 * signs, ⋯, the seat handle, the counter row and the hub hexagon + clock,
 * all as rendered and mapped into the face's own frame. null = usual spot.
 */
function gridPill(rotation: Rotation, content: HTMLElement): { x: number; y: number } | null {
  const pillEl = content.querySelector<HTMLElement>(".tile__pill");
  if (!pillEl || pillEl.classList.contains("tile__pill--corner")) return null;
  const sw = content.offsetWidth;
  const sh = content.offsetHeight;
  if (!sw || !sh) return null;
  const cr = content.getBoundingClientRect();
  const scr = faceFrame({ x: cr.left, y: cr.top, w: cr.width, h: cr.height }, rotation).toLocal;
  const local = (r: DOMRect, pad = 0): Box => {
    const b = boxOf([scr({ x: r.left, y: r.top }), scr({ x: r.right, y: r.bottom })]);
    return { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
  };
  const blocks: Box[] = [];
  const add = (el: Element | null, pad = 0) => {
    const r = el?.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) blocks.push(local(r, pad));
  };
  const lifeEl = content.querySelector<HTMLElement>(".tile__life");
  const lh = lifeEl ? lifeEl.offsetHeight : sh;
  if (lifeEl && typeof document.createRange === "function") {
    const range = document.createRange();
    range.selectNodeContents(lifeEl);
    const r = range.getBoundingClientRect?.();
    if (r && r.width > 0) {
      // The digits' ink, not the font's line box: the box above and below
      // the figures is empty and is where the timer fits on a short tile.
      const b = local(r);
      if (measureCtx === undefined) measureCtx = document.createElement("canvas").getContext("2d");
      if (measureCtx) {
        const cs = getComputedStyle(lifeEl);
        measureCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const m = measureCtx.measureText(lifeEl.textContent ?? "");
        const top = (m.fontBoundingBoxAscent ?? 0) - m.actualBoundingBoxAscent;
        const bot = (m.fontBoundingBoxDescent ?? 0) - m.actualBoundingBoxDescent;
        if (top > 0 && bot >= 0 && top + bot < b.h) {
          b.y += top;
          b.h -= top + bot;
        }
      }
      // A few px of air past the ink: touching still reads as "on the number".
      blocks.push({ x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 });
    }
    lifeEl.querySelectorAll(".digit--ambiguous").forEach((d) => add(d, 4));
  }
  content.querySelectorAll(".tile__sign").forEach((g) => add(g));
  add(content.querySelector(".tile__more"));
  add(content.querySelector(".tile__seat"));
  add(document.querySelector(".center__hex"));
  add(document.querySelector(".center__clock"));
  if (sh - lh > 1) blocks.push({ x: 0, y: lh, w: sw, h: sh - lh });
  const poly = [
    { x: 0, y: 0 },
    { x: sw, y: 0 },
    { x: sw, y: sh },
    { x: 0, y: sh },
  ];
  const w = pillEl.offsetWidth;
  const h = pillEl.offsetHeight;
  const spot = clearSpot(poly, blocks, w, h, { x: (DEFAULT_TIMER_POS.x / 100) * sw, y: (DEFAULT_TIMER_POS.y / 100) * sh });
  return spot?.moved ? { x: (spot.x / sw) * 100, y: (spot.y / sh) * 100 } : null;
}

// Air between a + / − glyph's ink and the corner disc's rim, so a pressed
// glyph (scaled 1.15) still clears it.
const SIGN_DISC_GAP = 6;
// A slid glyph's tap zone reaches this far past its ink, toward the number.
const SIGN_ZONE_PAD = 14;
// ...but stops at the number's ink. Where the slid glyph itself reaches the
// number, a hit box of its own ink and this much round it takes its taps.
const SIGN_OWN_PAD = 4;
// The + / − zones' CSS width (styles.css .tile__adj), as a share of the tile.
const ADJ_ZONE = 0.32;

/** A slid glyph's own hit box, px in its button's frame: from the button's outer edge (left for −, right for +) and top. */
interface SignHit {
  edge: number;
  top: number;
  w: number;
  h: number;
}

/** Per glyph [minus, plus]: how far it slides (px), how wide its zone must be (px, 0 = as styled), its own hit box. */
interface SignShift {
  shift: [number, number];
  zone: [number, number];
  hit: [SignHit | null, SignHit | null];
}

/**
 * Corner mode on a grid tile: the corner disc sits over the tile's corner,
 * and on a narrow tile its rim covers the + or − glyph there. Slide each
 * covered glyph along the tile (its own x) away from the disc -- toward the
 * number -- until its ink clears the rim. The glyph's tap zone keeps its
 * outer edge but grows toward the number to take the slid glyph in (a big
 * disc slides it right out of the usual 32%) -- but never onto the number's
 * ink. Where a big disc slides the glyph up against (or onto) the number, a
 * hit box of the glyph's own ink plus SIGN_OWN_PAD takes its taps instead,
 * so the glyph has priority over that much of the number and no more. The
 * disc is drawn over the zone, so a tap on the disc still passes the turn.
 * Everything is in the content box's own frame: offsetLeft/Top ignore
 * transforms, so neither the
 * button's translateY(-50%) nor a shift already applied feeds back into the
 * measurement, and the zone's width is reckoned from the tile, not from the
 * already-grown button. null when nothing is covered.
 */
function signShifts(content: HTMLElement): SignShift | null {
  const pillEl = content.querySelector<HTMLElement>(".tile__pill--corner");
  if (!pillEl || pillEl.offsetParent !== content) return null;
  const sw = content.offsetWidth;
  const cxf = parseFloat(pillEl.style.getPropertyValue("--cx")) / 100;
  const cyf = parseFloat(pillEl.style.getPropertyValue("--cy")) / 100;
  if (!sw || !Number.isFinite(cxf) || !Number.isFinite(cyf)) return null;
  const pw = pillEl.offsetWidth;
  const ph = pillEl.offsetHeight;
  // A quarter disc's centre is its flush corner, a half disc's the middle
  // of its flush edge; either way the radius is the box's short side.
  const c = { x: pillEl.offsetLeft + cxf * pw, y: pillEl.offsetTop + cyf * ph };
  const rad = Math.min(pw, ph) + SIGN_DISC_GAP;
  if (measureCtx === undefined) measureCtx = document.createElement("canvas").getContext("2d");
  const out: [number, number] = [0, 0];
  const zone: [number, number] = [0, 0];
  const hit: [SignHit | null, SignHit | null] = [null, null];
  // The number's ink along x, from layout sizes (not the screen box, which a
  // damage / heal kick scales): the text is centred across the life box; a 6
  // or 9 adds 0.03em margins each side (styles.css .digit--ambiguous).
  let nx0 = Infinity;
  let nx1 = -Infinity;
  const lifeEl = content.querySelector<HTMLElement>(".tile__life");
  if (lifeEl && measureCtx && lifeEl.textContent) {
    const ls = getComputedStyle(lifeEl);
    measureCtx.font = `${ls.fontWeight} ${ls.fontSize} ${ls.fontFamily}`;
    const lm = measureCtx.measureText(lifeEl.textContent);
    const w = lm.width + 0.06 * (parseFloat(ls.fontSize) || 0) * lifeEl.querySelectorAll(".digit--ambiguous").length;
    const tx = lifeEl.offsetLeft + (lifeEl.offsetWidth - w) / 2;
    nx0 = tx - lm.actualBoundingBoxLeft;
    nx1 = tx + w - (lm.width - lm.actualBoundingBoxRight);
  }
  content.querySelectorAll<HTMLElement>(".tile__adj").forEach((btn) => {
    const g = btn.querySelector<HTMLElement>(".tile__sign");
    const i = btn.classList.contains("tile__adj--plus") ? 1 : 0;
    if (!g || !measureCtx) return;
    const cs = getComputedStyle(g);
    measureCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = measureCtx.measureText(g.textContent ?? "");
    const fa = m.fontBoundingBoxAscent ?? 0;
    const fd = m.fontBoundingBoxDescent ?? 0;
    // The span's own box, untransformed; the glyph's ink inside it, with
    // the baseline below half the line gap and the font's ascent.
    const left = btn.offsetLeft + g.offsetLeft;
    const top = btn.offsetTop - btn.offsetHeight / 2 + g.offsetTop;
    const base = top + Math.max(0, g.offsetHeight - fa - fd) / 2 + fa;
    const x0 = left - m.actualBoundingBoxLeft;
    const x1 = left + m.actualBoundingBoxRight;
    const y0 = base - m.actualBoundingBoxAscent;
    const y1 = base + m.actualBoundingBoxDescent;
    if (!(x1 > x0) || !(y1 > y0)) return;
    const dy = Math.max(y0 - c.y, 0, c.y - y1);
    if (dy >= rad) return;
    const need = Math.sqrt(rad * rad - dy * dy);
    const toLeft = Math.min(0, c.x - need - x1);
    const toRight = Math.max(0, c.x + need - x0);
    if (toLeft === 0 || toRight === 0) return;
    // Away from the disc, staying on the tile: a corner disc leaves only one
    // way (toward the number); a half disc mid-edge takes the shorter one.
    const fitsL = x0 + toLeft >= 0;
    const fitsR = x1 + toRight <= sw;
    out[i] = fitsL && (!fitsR || -toLeft <= toRight) ? toLeft : fitsR ? toRight : 0;
    const s = Math.round(out[i]);
    if (!s) return;
    // − hugs the left edge, + the right; the zone must reach the slid ink's
    // inner side plus a fingertip, but never past the other zone's usual
    // edge or onto the number's ink.
    const inner = i === 0 ? x1 + s : sw - (x0 + s);
    const toNumber = i === 0 ? nx0 : sw - nx1;
    const w = Math.min(Math.max(inner + SIGN_ZONE_PAD, ADJ_ZONE * sw), (1 - ADJ_ZONE) * sw, toNumber);
    if (Math.abs(w - ADJ_ZONE * sw) >= 0.5) zone[i] = Math.floor(w);
    // The glyph (plus a hair) reaches the number, or past the zone: its own box.
    if (inner + SIGN_OWN_PAD > w)
      hit[i] = {
        edge: Math.round((i === 0 ? x0 + s : sw - (x1 + s)) - SIGN_OWN_PAD),
        top: Math.round(y0 - SIGN_OWN_PAD - (btn.offsetTop - btn.offsetHeight / 2)),
        w: Math.round(x1 - x0 + 2 * SIGN_OWN_PAD),
        h: Math.round(y1 - y0 + 2 * SIGN_OWN_PAD),
      };
  });
  return out[0] || out[1] ? { shift: [Math.round(out[0]), Math.round(out[1])], zone, hit } : null;
}

const sameShift = (a: SignShift | null, b: SignShift | null) => a === b || (!!a && !!b && JSON.stringify(a) === JSON.stringify(b));

/** A slid glyph's own hit box (see signShifts), inside its button. */
function SignHitBox({ hit, side }: { hit: SignHit | null | undefined; side: "left" | "right" }) {
  if (!hit) return null;
  return <span className="tile__sign-hit" style={{ [side]: hit.edge, top: hit.top, width: hit.w, height: hit.h }} />;
}

export function PlayerTile({
  placement,
  onOpenDetail,
  arcadeOpen,
  onCloseArcade,
  boardRef,
  cell,
}: Props) {
  const pid = placement.playerId;
  const seatDrag = useSeatUi((s) => (s.drag?.pid === pid ? s.drag : null));
  const anyDrag = useSeatUi((s) => !!s.drag && !s.drag.arming);
  const playerCount = useStore((s) => s.game.players.length);
  const player = useStore((s) => s.game.players.find((p) => p.id === pid));
  const turn = useStore((s) => s.game.turn);
  // Last player standing (returns a stable id/null primitive — safe selector).
  const winnerId = useStore((s) => {
    if (s.game.players.length <= 1) return null;
    const alive = s.game.players.filter((p) => !p.eliminated);
    return alive.length === 1 ? alive[0].id : null;
  });
  const scale = useStore((s) => s.settings.turnTimerScale);
  const timerEnabled = useStore((s) => s.settings.turnTimerEnabled);
  const timerPlacement = useStore((s) => s.settings.turnTimerPlacement);
  const warnOn = useStore((s) => s.settings.turnWarnOn);
  const layout = useStore((s) => s.game.layout);
  // A freeform cell's auto-placed timer keeps clear of the stickers.
  const stickers = useStore((s) => (cell ? s.game.stickers : NO_STICKERS));
  // Share of the turn budget still on the clock, for the countdown ring.
  const turnFraction =
    turn.budgetSec > 0
      ? Math.max(0, Math.min(1, turn.remainingSec / turn.budgetSec))
      : 0;
  const adjustLife = useStore((s) => s.adjustLife);
  const passTurn = useStore((s) => s.passTurn);
  const setTimerPos = useStore((s) => s.setTimerPos);
  const setActivePlayer = useStore((s) => s.setActivePlayer);
  const toggleEliminated = useStore((s) => s.toggleEliminated);

  const contentRef = useRef<HTMLDivElement>(null);
  const pinnedToCorner = timerPlacement === "corner";
  // The timer goes to a clear spot in the tile until it is dragged somewhere.
  // Freeform corner mode cannot drag, so it is always placed; a grid tile's
  // corner mode is the corner disc instead.
  const autoPill = cell ? pinnedToCorner || player?.timerPos?.x === undefined : !pinnedToCorner && player?.timerPos?.x === undefined;
  const [spots, setSpots] = useState<PolySpots | null>(null);
  // Corner mode: how far each + / − glyph slides clear of the corner disc.
  const [signShift, setSignShift] = useState<SignShift | null>(null);
  const autoPos = autoPill && spots?.pill ? spots.pill : undefined;
  const pill = usePillGesture({
    pos: { ...DEFAULT_TIMER_POS, ...player?.timerPos, ...autoPos } as TilePos & { x: number; y: number },
    rotation: placement.rotation,
    pinned: pinnedToCorner,
    box: () => contentRef.current,
    onTap: passTurn,
    onCommit: (p) => setTimerPos(pid, p),
  });

  // Accumulating life swing: sums rapid taps, shows a "+3 / -5" chip, then
  // fades and commits. Tapping the chip undoes the whole swing (mis-tap guard).
  const [swing, setSwing] = useState(0);
  const swingTimer = useRef<number | null>(null);
  // The life value we expect after our own edits — lets us (a) accumulate the
  // *applied* (clamp-aware) delta and (b) detect life changed by another path.
  const expectedLife = useRef(player?.life ?? 0);
  const clearSwingTimer = () => {
    if (swingTimer.current !== null) window.clearTimeout(swingTimer.current);
    swingTimer.current = null;
  };
  const bumpLife = useCallback(
    (n: number) => {
      const before = expectedLife.current;
      const after = clampLife(before + n);
      adjustLife(pid, n);
      expectedLife.current = after;
      setSwing((s) => s + (after - before)); // applied delta, not nominal
      if (swingTimer.current !== null) window.clearTimeout(swingTimer.current);
      swingTimer.current = window.setTimeout(() => setSwing(0), 2200);
    },
    [adjustLife, pid],
  );
  const undoSwing = () => {
    if (swing !== 0) {
      adjustLife(pid, -swing);
      expectedLife.current = clampLife(expectedLife.current - swing);
    }
    setSwing(0);
    clearSwingTimer();
  };
  // If life changed by any other path (Set life, commander damage), the pending
  // swing is stale — drop it so undo can't corrupt the new total.
  useEffect(() => {
    const life = player?.life;
    if (life === undefined) return;
    if (life !== expectedLife.current) {
      expectedLife.current = life;
      setSwing(0);
      clearSwingTimer();
    }
  }, [player?.life]);
  useEffect(() => clearSwingTimer, []);

  // Re-measured every render (life digits, timer size and counters all move
  // things); state only changes when a spot does.
  useLayoutEffect(() => {
    const content = contentRef.current;
    const next =
      !content || !player ? null
      : cell ? polySpots(cell, placement.rotation, content, String(player.life), autoPill, stickers)
      : { more: null, pill: autoPill ? gridPill(placement.rotation, content) : null };
    setSpots((s) => (s === next || (s && next && sameSpot(s.more, next.more) && sameSpot(s.pill, next.pill)) ? s : next));
    const shift = content && !cell && pinnedToCorner ? signShifts(content) : null;
    setSignShift((s) => (sameShift(s, shift) ? s : shift));
  });

  const isActive = turn.activePlayerId === pid;

  // Long-press the tile body (not a control) to make this seat the active turn
  // — recovery from a mis-pass without cycling the whole table.
  const longPress = useRef<number | null>(null);
  const lpStart = useRef<{ x: number; y: number } | null>(null);
  const cancelLongPress = () => {
    if (longPress.current !== null) window.clearTimeout(longPress.current);
    longPress.current = null;
    lpStart.current = null;
  };
  const onContentDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    cancelLongPress();
    lpStart.current = { x: e.clientX, y: e.clientY };
    longPress.current = window.setTimeout(() => {
      if (!isActive && player && !player.eliminated) setActivePlayer(pid);
    }, 550);
  };
  const onContentMove = (e: PointerEvent) => {
    const st = lpStart.current;
    if (st && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 10) {
      cancelLongPress();
    }
  };
  useEffect(() => cancelLongPress, []);

  const minus = useHoldRepeat(bumpLife, -1, -10);
  const plus = useHoldRepeat(bumpLife, 1, 10);

  // Derived before the early return below so the hook call order stays stable
  // (a tile can briefly render without its player while a pod is resized).
  const poisonDead = isPoisonLethal(player?.counters.poison ?? 0);
  const cmdrDead = isCommanderDamageLethal(player?.commanderDamage);
  const lethal = (player?.life ?? 1) <= 0 || poisonDead || cmdrDead;
  const effectsOn = useStore((s) => s.settings.effectsOn);
  const vibrateOn = useStore((s) => s.settings.vibrateOn);
  const fx = useLifeFeedback(player?.life ?? 0, lethal, effectsOn, vibrateOn);

  if (!player) return null;

  const rotated = placement.rotation === 90 || placement.rotation === 270;
  const deathCause = poisonDead ? "POISON" : cmdrDead ? "CMDR" : "DEAD";
  const lowLife = player.life > 0 && player.life <= 5;
  const pillPos = { ...DEFAULT_TIMER_POS, ...player.timerPos, ...autoPos, ...pill.live };
  const handle = seatHandleSpot(layout, pid);
  const junction = pinnedToCorner ? junctionFor(layout, pid) : null;
  const corner = junction ? cornerTimer(junction, placement.rotation) : null;
  const pillScale = scale * (pillPos.scale ?? 1);
  const pillPlace: CSSProperties = corner
    ? corner.style
    : {
        left: `${pillPos.x}%`,
        top: `${pillPos.y}%`,
        transform: `translate(-50%, -50%) rotate(${pillPos.angle ?? 0}deg)`,
      };

  const faceW = cell ? (rotated ? cell.face.h : cell.face.w) : 0;
  const faceH = cell ? (rotated ? cell.face.w : cell.face.h) : 0;
  const contentStyle = (
    cell
      ? {
          left: `${cell.face.x + cell.face.w / 2}px`,
          top: `${cell.face.y + cell.face.h / 2}px`,
          transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
          width: `${faceW}px`,
          height: `${faceH}px`,
          "--lw": `${faceW}px`,
          "--lh": `${faceH}px`,
        }
      : {
          transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
          width: rotated ? "100cqh" : "100%",
          height: rotated ? "100cqw" : "100%",
          // The content box's own width and height, for anything sized to fit it.
          "--lw": rotated ? "100cqh" : "100cqw",
          "--lh": rotated ? "100cqw" : "100cqh",
        }
  ) as unknown as CSSProperties;

  // Contrast comes from the look's declared base colour, not from the rendered
  // pixels, so a gradient, striped or animated tile is as legible as a flat
  // one. The style's CSS reads the --look-* custom properties.
  const look = resolveLook(player.look, player.color);
  const tileStyle: CSSProperties = {
    ...(cell
      ? {
          left: `${cell.box.x}px`,
          top: `${cell.box.y}px`,
          width: `${cell.box.w}px`,
          height: `${cell.box.h}px`,
          clipPath: cell.clip,
        }
      : {
          gridRow: `${placement.row} / span ${placement.rowSpan}`,
          gridColumn: `${placement.col} / span ${placement.colSpan}`,
        }),
    color: textOn(look.base),
    ...look.vars,
  } as CSSProperties;

  return (
    <div
      className={`tile look${cell ? " tile--poly" : ""}${player.eliminated ? " tile--out" : ""}${
        lethal ? " tile--lethal" : ""
      }${isActive && !player.eliminated ? " tile--active" : ""}`}
      style={tileStyle}
      data-pid={pid}
      data-seat-src={seatDrag && !seatDrag.arming ? "" : undefined}
      data-style={look.styleId}
      data-fx={fx?.kind}
      data-fx-level={fx?.intensity}
    >
      {look.layers > 0 && (
        <div className="tile__look" aria-hidden>
          {Array.from({ length: look.layers }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      )}
      {cell && (
        <svg className="tile__ring" aria-hidden="true" width={cell.box.w} height={cell.box.h}>
          <path d={cell.ring} />
        </svg>
      )}
      <div
        className={`tile__content${cell ? " tile__content--poly" : ""}`}
        ref={contentRef}
        style={contentStyle}
        onPointerDown={onContentDown}
        onPointerMove={onContentMove}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
      >
        <button
          className="tile__adj tile__adj--minus"
          aria-label={`${player.name} decrease life`}
          style={signShift?.zone[0] ? { width: signShift.zone[0] } : undefined}
          {...minus}
        >
          <span className="tile__sign" style={signShift?.shift[0] ? { translate: `${signShift.shift[0]}px 0` } : undefined}>–</span>
          <SignHitBox hit={signShift?.hit[0]} side="left" />
        </button>
        <button
          className="tile__adj tile__adj--plus"
          aria-label={`${player.name} increase life`}
          style={signShift?.zone[1] ? { width: signShift.zone[1] } : undefined}
          {...plus}
        >
          <span className="tile__sign" style={signShift?.shift[1] ? { translate: `${signShift.shift[1]}px 0` } : undefined}>+</span>
          <SignHitBox hit={signShift?.hit[1]} side="right" />
        </button>

        <div
          className={`tile__life${lowLife ? " tile__life--low" : ""}`}
          aria-live="polite"
          aria-atomic="true"
          aria-label={`${player.name} life ${player.life}`}
        >
          <Digits value={player.life} />
        </div>

        {swing !== 0 && (
          <button
            className={`tile__swing${
              swing > 0 ? " tile__swing--up" : " tile__swing--down"
            }`}
            onClick={undoSwing}
            aria-label={`undo life change ${swing > 0 ? "+" : ""}${swing}`}
          >
            {swing > 0 ? `+${swing}` : swing}
            <span className="tile__swing-undo">↺</span>
          </button>
        )}

        {winnerId === pid && !player.eliminated && !lethal && (
          <div className="tile__winner">
            <span aria-hidden>🏆</span> WINS
          </div>
        )}

        {lethal && (
          <button
            className="tile__skull"
            onClick={() => toggleEliminated(pid)}
            aria-label={`Lethal (${deathCause}); tap to ${
              player.eliminated ? "revive" : "eliminate"
            }`}
          >
            <span aria-hidden>☠</span>
            <span className="tile__skull-cause">{deathCause}</span>
          </button>
        )}

        <CounterSteppers player={player} />

        {playerCount > 1 && !cell && !arcadeOpen && (!anyDrag || seatDrag) && (
          <button
            className={`tile__seat tile__seat--${handle.side}${seatDrag?.arming ? " is-arming" : ""}`}
            style={handleStyle(handle)}
            aria-label={`${player.name}: hold to move seat`}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              startSeatDrag(pid, e.nativeEvent, boardRef?.current ?? null);
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
            </svg>
          </button>
        )}

        <button
          className="tile__more"
          style={spots?.more ? { left: spots.more.x, top: spots.more.y, right: "auto", bottom: "auto" } : undefined}
          onClick={() => onOpenDetail(pid)}
          aria-label="player details"
        >
          ⋯
        </button>

        {isActive && timerEnabled && (
          <button
            className={`tile__pill${turn.expired ? " tile__pill--expired" : ""}${
              warnOn && !turn.expired && warnLevel(turn.remainingSec)
                ? ` tile__pill--${warnLevel(turn.remainingSec)}`
                : ""
            }${
              pill.live ? " tile__pill--dragging" : ""
            }${corner ? ` tile__pill--corner tile__pill--${corner.kind}${corner.kind === "half" && !corner.hugY ? " tile__pill--side" : ""}` : ""
            }`}
            style={
              {
                ...pillPlace,
                "--timer-scale": String(pillScale),
                // Drives the countdown ring; drains clockwise from the top.
                "--pct": String(turnFraction),
              } as CSSProperties
            }
            onPointerDown={pill.onPointerDown}
            // Pointer taps are handled by the gesture (and their clicks
            // swallowed); this is the keyboard's Enter/Space.
            onClick={(e) => {
              if (e.detail === 0) passTurn();
            }}
            aria-label={
              junction
                ? "turn timer: tap to pass turn, pinch to resize"
                : "turn timer: tap to pass turn, drag to move, pinch to resize or turn"
            }
          >
            <span className="tile__pill-inner">
              <span className="tile__pill-turn">{turn.turnNumber}</span>
              <span className="tile__pill-time">
                {formatClock(turn.remainingSec)}
              </span>
            </span>
          </button>
        )}

        {/* Last inside the rotated content box, so it covers this tile and
            only this tile, already facing the right way. */}
        {arcadeOpen && <ArcadeTile playerId={pid} onClose={onCloseArcade} />}
      </div>
    </div>
  );
}
