import { create } from "zustand";
import { useStore } from "../state/store";
import type { GameState, LayoutConfig } from "../state/types";
import { asLayout, planMoves, swapSeats, type MovePlan, type PxRect } from "../layout/table";
import { inEndZone, pickTarget, type SeatTarget } from "../layout/seatTarget";
import { remapStickers } from "../game/stickers";

export const HOLD_MS = 350;
const DRIFT_PX = 8;
export const UNDO_MS = 5000;
const FACING_MS = 4000;

export interface SeatDrag {
  pid: string;
  /** Holding, ring filling; not armed yet. */
  arming: boolean;
  x: number;
  y: number;
  armX: number;
  armY: number;
  departed: boolean;
  leftArmZone: boolean;
  W: number;
  H: number;
  gap: number;
  rects: Record<string, PxRect>;
  plan: MovePlan;
  target: SeatTarget;
  /** The layout the plan was made from; a drop only lands on that layout. */
  layout: LayoutConfig | null;
}

/** One seat edit, undoable while the board still shows what it produced. */
export interface SeatUndo {
  before: LayoutConfig;
  beforeStickers: GameState["stickers"];
  after: LayoutConfig;
  afterStickers: GameState["stickers"];
  pids: string[];
  until: number;
}

interface SeatUi {
  drag: SeatDrag | null;
  undo: SeatUndo | null;
  facing: { pid: string; until: number } | null;
  /** The seat that just moved, for a brief flash. */
  flash: string | null;
}

export const useSeatUi = create<SeatUi>(() => ({ drag: null, undo: null, facing: null, flash: null }));

/** Set just before a seat edit so the board slides the tiles; read once. */
let slideNext = false;
export function takeSlide(): boolean {
  const v = slideNext;
  slideNext = false;
  return v;
}

let undoTimer: number | null = null;
let facingTimer: number | null = null;
let flashTimer: number | null = null;

export function clearUndo() {
  if (undoTimer !== null) window.clearTimeout(undoTimer);
  undoTimer = null;
  useSeatUi.setState({ undo: null });
}
export function closeFacing() {
  if (facingTimer !== null) window.clearTimeout(facingTimer);
  facingTimer = null;
  useSeatUi.setState({ facing: null });
}
export function openFacing(pid: string) {
  closeFacing();
  useSeatUi.setState({ facing: { pid, until: Date.now() + FACING_MS } });
  facingTimer = window.setTimeout(closeFacing, FACING_MS);
}
/** Any tap on the facing picker keeps it open a little longer. */
export function touchFacing() {
  const f = useSeatUi.getState().facing;
  if (f) openFacing(f.pid);
}

/**
 * Undo only while the board still shows what the edit produced. A new game
 * (even one keeping this arrangement), a layout from the picker or another
 * seat edit retires it; stickers moved since are carried back, not reverted.
 */
export function undoSeats() {
  const u = useSeatUi.getState().undo;
  if (!u) return;
  clearUndo();
  const g = useStore.getState().game;
  if (g.layout !== u.after) return;
  const stickers = g.stickers === u.afterStickers ? u.beforeStickers : remapStickers(g.stickers, u.after, u.before);
  edit(() => useStore.getState().restoreSeats(u.before, stickers));
}

// The undo pill goes the moment the layout is no longer the edited one.
useStore.subscribe((s) => {
  const u = useSeatUi.getState().undo;
  if (u && s.game.layout !== u.after) clearUndo();
});

/** Run a seat edit with the slide armed; true when the layout changed. */
function edit(run: () => void): boolean {
  const before = useStore.getState().game.layout;
  slideNext = true;
  run();
  if (useStore.getState().game.layout !== before) return true;
  slideNext = false;
  return false;
}

/** Make a seat edit undoable -- only if the store took it. */
function remember(pids: string[], run: () => void) {
  const was = useStore.getState().game;
  if (!edit(run)) return;
  const now = useStore.getState().game;
  clearUndo();
  useSeatUi.setState({
    undo: {
      before: was.layout,
      beforeStickers: was.stickers,
      after: now.layout,
      afterStickers: now.stickers,
      pids,
      until: Date.now() + UNDO_MS,
    },
  });
  undoTimer = window.setTimeout(clearUndo, UNDO_MS);
  if (flashTimer !== null) window.clearTimeout(flashTimer);
  useSeatUi.setState({ flash: pids[0] });
  flashTimer = window.setTimeout(() => useSeatUi.setState({ flash: null }), 700);
}

/** Turn a seat from the facing picker, undoable like a move. */
export function faceSeat(pid: string, rotation: 0 | 90 | 180 | 270) {
  remember([pid], () => useStore.getState().setSeatRotation(pid, rotation));
  touchFacing();
}

function commit(d: SeatDrag) {
  const t = d.target;
  const store = useStore.getState();
  const layout = store.game.layout;
  const n = store.game.players.length;
  // The plan and preview were made for the board as it was when the seat
  // lifted. If anything changed it since, the drop means nothing.
  if (layout !== d.layout) return;
  if (t.kind === "home" || (t.kind === "none" && !d.departed)) {
    openFacing(d.pid);
    return;
  }
  if (t.kind === "swap") {
    remember([d.pid, t.with], () => store.rearrangeSeats(asLayout(swapSeats(layout, d.pid, t.with), n)));
    return;
  }
  if (t.kind === "move") {
    remember([d.pid], () => store.rearrangeSeats(asLayout(t.move.grid, n)));
  }
}

let active: (() => void) | null = null;

/**
 * Press and hold a seat's handle: after HOLD_MS still, the seat lifts and
 * follows the finger; letting go swaps, moves, or (on its own tile) offers a
 * facing. Only the holding finger is captured: everyone else's taps work.
 */
export function startSeatDrag(pid: string, e: PointerEvent, board: HTMLElement | null) {
  if (active || !board) return;
  const id = e.pointerId;
  const sx = e.clientX;
  const sy = e.clientY;
  let d: SeatDrag | null = null;
  let armed = false;
  let used = false;
  // The board this gesture is about. If anything else changes the layout
  // while the seat is held (a new game, the layout picker), the gesture ends.
  const start = useStore.getState().game.layout;
  closeFacing();

  const boardBox = () => board.getBoundingClientRect();
  const arm = () => {
    const b = boardBox();
    const gap = parseFloat(getComputedStyle(board).rowGap) || 8;
    const rects: Record<string, PxRect> = {};
    board.querySelectorAll<HTMLElement>(".tile[data-pid]").forEach((el) => {
      const r = el.getBoundingClientRect();
      rects[el.dataset.pid!] = { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
    });
    const plan = planMoves(start, pid, b.width, b.height, gap);
    armed = true;
    used = true;
    d = {
      pid,
      arming: false,
      x: sx - b.left,
      y: sy - b.top,
      armX: sx - b.left,
      armY: sy - b.top,
      departed: false,
      leftArmZone: false,
      W: b.width,
      H: b.height,
      gap,
      rects,
      plan,
      target: { kind: "none" },
      layout: start,
    };
    useSeatUi.setState({ drag: d });
    if (useStore.getState().settings.vibrateOn) navigator.vibrate?.(10);
  };
  const holdTimer = window.setTimeout(arm, HOLD_MS);
  // The ring shows only while holding.
  useSeatUi.setState({
    drag: {
      pid,
      arming: true,
      x: 0,
      y: 0,
      armX: 0,
      armY: 0,
      departed: false,
      leftArmZone: false,
      W: 0,
      H: 0,
      gap: 8,
      rects: {},
      plan: { table: false, moves: [], locked: {} },
      target: { kind: "none" },
      layout: null,
    },
  });

  const own = (ev: Event) => {
    ev.stopPropagation();
    ev.preventDefault();
  };
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    if (!armed) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > DRIFT_PX) stop();
      return;
    }
    own(ev);
    const b = boardBox();
    const x = ev.clientX - b.left;
    const y = ev.clientY - b.top;
    const cur = d!;
    const departed = cur.departed || Math.hypot(x - cur.armX, y - cur.armY) >= 24;
    const armZone = inEndZone(cur.armY, cur.H);
    const leftArmZone = cur.leftArmZone || (armZone !== null && inEndZone(y, cur.H) !== armZone);
    const next = { ...cur, x, y, departed, leftArmZone };
    next.target = pickTarget({ ...next, current: cur.target });
    d = next;
    useSeatUi.setState({ drag: next });
  };
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    if (armed) own(ev);
    const done = d;
    stop();
    if (done && ev.type === "pointerup") commit(done);
  };
  const swallowClick = (ev: MouseEvent) => {
    if (!used) return;
    const pidOf = (ev as PointerEvent).pointerId;
    if (typeof pidOf === "number" && pidOf >= 0 && pidOf !== id) return;
    own(ev);
  };
  // touch-action: none stops the page panning, but Chrome still reads a
  // release mid-swipe as a fling and spends the next tap anywhere stopping it
  // (no click). Claiming the moves keeps the swipe from becoming a gesture.
  const noFling = (ev: TouchEvent) => {
    if (armed && ev.cancelable) ev.preventDefault();
  };
  const cancel = () => stop();
  const unwatch = useStore.subscribe((st) => {
    if (st.game.layout !== start) stop();
  });
  const stop = () => {
    window.clearTimeout(holdTimer);
    unwatch();
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", up, true);
    window.removeEventListener("touchmove", noFling, true);
    window.removeEventListener("resize", cancel);
    document.removeEventListener("visibilitychange", cancel);
    window.setTimeout(() => window.removeEventListener("click", swallowClick, true), 350);
    useSeatUi.setState({ drag: null });
    active = null;
  };
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
  window.addEventListener("touchmove", noFling, { capture: true, passive: false });
  window.addEventListener("click", swallowClick, true);
  window.addEventListener("resize", cancel);
  document.addEventListener("visibilitychange", cancel);
  active = stop;
}
