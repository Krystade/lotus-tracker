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
import type { Placement, Rotation, TilePos } from "../state/types";
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

// Corner placement. The pill hugs the edge of the tile the junction is on --
// in every built-in layout that is the tile's own top edge, where the +/-
// zones (the middle 56% of the height) do not reach -- so a near-miss on
// life never passes the turn. Along that edge it keeps clear of the tile's
// rounded corner or, where the junction is the middle of the board, of the
// menu hexagon and the game clock under it. Screen px.
//
// The hexagon-and-clock column is centred as a whole, so the hexagon sits
// ~12px above the board's middle; on a notched phone the safe areas push the
// board's middle a further ~8px down from the screen's. Hence up > sideways.
const HEX_CLEARANCE = { left: 40, right: 40, up: 56, down: 50 };
// Corner timer at the board's middle: the face sits this far out along both
// edges, clear of the hexagon (27px) and the clock tucked under it.
const HEX_HOLE = 50;

const LOCAL_TO_SCREEN: Record<Rotation, Rotation> = { 0: 0, 90: 270, 180: 180, 270: 90 };

/** The seat handle clear of the menu hexagon and clock (see seatHandleSpot). */
function handleStyle(h: SeatHandleSpot): CSSProperties | undefined {
  if (h.push) return { "--seat-at": `max(5px, calc(${h.push.px}px - ${h.push.behind} * var(--lw)))` } as CSSProperties;
  if (h.room) return { "--seat-room": `calc(${h.room.ahead} * var(--lw) - ${h.room.px}px)` } as CSSProperties;
  return undefined;
}

/**
 * "corner" mode: the timer fills the corner of the tile where the most seats
 * meet, flush against both edges, with a rounded inner edge -- a quarter
 * disc. Where that point is the middle of an edge (two seats head to head)
 * it is a half disc flush against the edge, beside the menu hexagon.
 * Everything here is in the tile's own (rotated) frame.
 */
function cornerTimer(j: TileJunction, rot: Rotation) {
  const [ax, ay] = screenToLocal(rot, j.fx - 0.5, j.fy - 0.5);
  const [dx, dy] = screenToLocal(rot, j.sx, j.sy).map(Math.sign) as [number, number];
  if (dx !== 0 && dy !== 0) {
    // A corner: (dx, dy) points from it into the tile.
    const from = dx > 0 ? (dy > 0 ? 90 : 0) : dy > 0 ? 180 : 270;
    return {
      kind: "quarter" as const,
      style: {
        left: dx > 0 ? 0 : "auto",
        right: dx < 0 ? 0 : "auto",
        top: dy > 0 ? 0 : "auto",
        bottom: dy < 0 ? 0 : "auto",
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
  // Middle of an edge. Sit beside the hexagon that covers that point.
  const hugY = dy !== 0;
  const into = hugY ? dy : dx;
  // Always to the tile's own right of the point (its +x or +y).
  const unit: [number, number] = hugY ? [1, 0] : [0, 1];
  const [sx, sy] = screenToLocal(LOCAL_TO_SCREEN[rot], unit[0], unit[1]);
  const need =
    sx > 0 ? HEX_CLEARANCE.right : sx < 0 ? HEX_CLEARANCE.left : sy > 0 ? HEX_CLEARANCE.down : HEX_CLEARANCE.up;
  const pos = (0.5 + (hugY ? ax : ay)) * 100;
  const from = hugY ? (into > 0 ? 90 : 270) : into > 0 ? 0 : 180;
  return {
    kind: "half" as const,
    style: {
      ...(hugY
        ? { left: `clamp(0px, calc(${pos}% + ${need}px), calc(100% - 2 * var(--r)))`, [into > 0 ? "top" : "bottom"]: 0 }
        : { top: `clamp(0px, calc(${pos}% + ${need}px), calc(100% - 2 * var(--r)))`, [into > 0 ? "left" : "right"]: 0 }),
      "--cx": hugY ? "50%" : into > 0 ? "0%" : "100%",
      "--cy": hugY ? (into > 0 ? "0%" : "100%") : "50%",
      "--from": `${from}deg`,
      "--sweep": "180deg",
      borderRadius: hugY
        ? into > 0 ? "0 0 999px 999px" : "999px 999px 0 0"
        : into > 0 ? "0 999px 999px 0" : "999px 0 0 999px",
      "--jh": hugY ? "center" : into > 0 ? "flex-start" : "flex-end",
      "--jv": hugY ? (into > 0 ? "flex-start" : "flex-end") : "center",
    } as unknown as CSSProperties,
    hugY,
  };
}

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
 * number, the signs and the menu hexagon (the timer also of ⋯ and the counter
 * row). Measured in the face's own frame from the rendered sizes.
 */
function polySpots(cell: PolyGeom, rotation: Rotation, content: HTMLElement, life: string, autoPill: boolean): PolySpots {
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
  const local = (r: DOMRect, pad = 0): Box => {
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
    const spot = clearSpot(poly, pb, w, h, { x: (DEFAULT_TIMER_POS.x / 100) * sw, y: (DEFAULT_TIMER_POS.y / 100) * sh });
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
      : cell ? polySpots(cell, placement.rotation, content, String(player.life), autoPill)
      : { more: null, pill: autoPill ? gridPill(placement.rotation, content) : null };
    setSpots((s) => (s === next || (s && next && sameSpot(s.more, next.more) && sameSpot(s.pill, next.pill)) ? s : next));
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
          {...minus}
        >
          <span className="tile__sign">–</span>
        </button>
        <button
          className="tile__adj tile__adj--plus"
          aria-label={`${player.name} increase life`}
          {...plus}
        >
          <span className="tile__sign">+</span>
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
