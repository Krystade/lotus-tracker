import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Rotation, TilePos } from "../state/types";
import { TIMER_MAX_SCALE, TIMER_MIN_SCALE } from "../state/sanitize";

const MOVE_THRESHOLD = 6;
/** A turn within this many degrees of square snaps to it. */
const SNAP_DEG = 10;

type Pt = { x: number; y: number };

/** Convert a screen-space delta into the tile's own (pre-rotation) axes. */
export function screenToLocal(rot: Rotation, dx: number, dy: number): [number, number] {
  switch (rot) {
    case 90:
      return [dy, -dx];
    case 180:
      return [-dx, -dy];
    case 270:
      return [-dy, dx];
    default:
      return [dx, dy];
  }
}

export function snapAngle(a: number): number {
  const n = ((a % 360) + 360) % 360;
  const sq = Math.round(n / 90) * 90;
  return Math.abs(n - sq) <= SNAP_DEG ? sq % 360 : n;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The turn timer's gestures. A tap passes the turn. One finger drags it
 * (unless it is pinned to the corner). A second finger, anywhere on the
 * screen, pinches it bigger or smaller and -- when it is free -- twists it
 * round. While it is held, the extra fingers belong to it and never reach
 * the tiles underneath.
 */
export function usePillGesture(opts: {
  pos: Required<Pick<TilePos, "x" | "y">> & TilePos;
  rotation: Rotation;
  pinned: boolean;
  box: () => HTMLElement | null;
  onTap: () => void;
  onCommit: (p: TilePos) => void;
}) {
  const [live, setLive] = useState<TilePos | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const latest = useRef(opts);
  latest.current = opts;
  useEffect(() => () => cleanup.current?.(), []);

  const onPointerDown = (e: PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (cleanup.current) return;
    const el = latest.current.box();
    if (!el) return;
    const { rotation, pinned } = latest.current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;

    const start = latest.current.pos;
    let cur: TilePos = { ...start, scale: start.scale ?? 1, angle: start.angle ?? 0 };
    const pts = new Map<number, Pt>([[e.pointerId, { x: e.clientX, y: e.clientY }]]);
    let base = { cur, pts: new Map(pts) };
    let moved = false;
    const origin = { x: e.clientX, y: e.clientY };

    const rebase = () => {
      base = { cur, pts: new Map(pts) };
    };
    const update = () => {
      const now = [...pts.values()];
      const was = [...base.pts.values()];
      if (!now.length || !was.length) return;
      const mid = (p: Pt[]) => ({
        x: p.reduce((a, q) => a + q.x, 0) / p.length,
        y: p.reduce((a, q) => a + q.y, 0) / p.length,
      });
      let scale = base.cur.scale ?? 1;
      let angle = base.cur.angle ?? 0;
      if (now.length >= 2 && was.length >= 2) {
        const d = (p: Pt[]) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        const ang = (p: Pt[]) => (Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) * 180) / Math.PI;
        const d0 = d(was);
        if (d0 > 10) scale = clamp(scale * (d(now) / d0), TIMER_MIN_SCALE, TIMER_MAX_SCALE);
        // Rotation keeps its sense through the tile's own turn, so a screen
        // twist is the same twist in the tile's frame.
        if (!pinned) angle = snapAngle(angle + ang(now) - ang(was));
      }
      let { x, y } = base.cur;
      if (!pinned) {
        const m1 = mid(now);
        const m0 = mid(was);
        const [lx, ly] = screenToLocal(rotation, m1.x - m0.x, m1.y - m0.y);
        x = clamp(x + (lx / w) * 100, 4, 96);
        y = clamp(y + (ly / h) * 100, 4, 96);
      }
      cur = { x, y, scale, angle };
      setLive(cur);
    };

    const own = (ev: Event) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    const down = (ev: globalThis.PointerEvent) => {
      if (pts.has(ev.pointerId)) return;
      own(ev);
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      moved = true; // a second finger is a pinch, never a tap
      rebase();
    };
    const move = (ev: globalThis.PointerEvent) => {
      if (!pts.has(ev.pointerId)) return;
      own(ev);
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (!moved && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < MOVE_THRESHOLD) return;
      moved = true;
      update();
    };
    const up = (ev: globalThis.PointerEvent) => {
      if (!pts.has(ev.pointerId)) return;
      own(ev);
      pts.delete(ev.pointerId);
      if (pts.size > 0) {
        rebase();
        return;
      }
      finish();
      if (moved) latest.current.onCommit(cur);
      else if (ev.type === "pointerup") latest.current.onTap();
    };
    const swallowClick = (ev: MouseEvent) => own(ev);
    const noZoom = (ev: Event) => ev.preventDefault();
    const finish = () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      document.removeEventListener("gesturestart", noZoom);
      setLive(null);
      cleanup.current = null;
      window.setTimeout(() => window.removeEventListener("click", swallowClick, true), 350);
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("click", swallowClick, true);
    document.addEventListener("gesturestart", noZoom);
    cleanup.current = () => {
      finish();
      window.removeEventListener("click", swallowClick, true);
    };
  };

  return { live, onPointerDown };
}
