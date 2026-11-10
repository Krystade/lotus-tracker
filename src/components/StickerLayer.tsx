import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useStore } from "../state/store";
import { MAX_SCALE, MIN_SCALE, seatAt, stickerDef } from "../game/stickers";
import type { StickerHold } from "../state/types";
import { refitStickers } from "./stickerSpot";

const MOVE_THRESHOLD = 6;
// After a layout change: Board's seat slide (SLIDE_MS) and a little more.
const REFIT_MS = 250;

/**
 * Stickers float over the whole board, wherever the table puts them. Each one
 * faces whichever seat's tile it sits over, and that seat holds it.
 */
export function StickerLayer({ boardRef }: { boardRef: React.RefObject<HTMLDivElement> }) {
  const stickers = useStore((s) => s.game.stickers);
  // A freeform layout change can leave a sticker outside its holder's cell
  // or on its number: once the new board has drawn (and any seat slide has
  // finished), re-place just those. Not on load: a saved board stays as it was.
  const layout = useStore((s) => s.game.layout);
  const seen = useRef(layout);
  useEffect(() => {
    if (seen.current === layout) return;
    seen.current = layout;
    if (!layout.cells?.length) return;
    const t = window.setTimeout(() => {
      const s = useStore.getState();
      if (s.game.layout !== layout) return;
      for (const m of refitStickers(layout, s.game.stickers)) s.placeSticker(m.id, m);
    }, REFIT_MS);
    return () => window.clearTimeout(t);
  }, [layout]);
  return (
    <div className="stickers" aria-hidden={stickers.length === 0}>
      {stickers.map((st) => (
        <Sticker key={st.id} st={st} boardRef={boardRef} />
      ))}
    </div>
  );
}

interface Live {
  x: number;
  y: number;
  scale: number;
}

/**
 * One finger on the sticker drags it. A second finger -- anywhere on the
 * screen, since a small sticker leaves no room for two -- pinches it bigger
 * or smaller. While a sticker is held, those extra touches belong to it and
 * never reach the tile underneath.
 */
function Sticker({ st, boardRef }: { st: StickerHold; boardRef: React.RefObject<HTMLDivElement> }) {
  const place = useStore((s) => s.placeSticker);
  const layout = useStore((s) => s.game.layout);
  const def = stickerDef(st.id);
  const [live, setLive] = useState<Live | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  const shown = live ?? st;
  const rotation = seatAt(layout, shown.x, shown.y)?.rotation ?? 0;

  const onDown = (e: PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (cleanup.current) return; // a gesture is already running
    const board = boardRef.current?.getBoundingClientRect();
    if (!board) return;

    const pts = new Map<number, { x: number; y: number }>();
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    let cur: Live = { x: st.x, y: st.y, scale: st.scale };
    let base = { cur, pts: new Map(pts) };
    let moved = false;
    // Every finger that took part: only their clicks are swallowed.
    const used = new Set<number>([e.pointerId]);
    const origin = { x: e.clientX, y: e.clientY };

    const rebase = () => {
      base = { cur, pts: new Map(pts) };
    };
    const update = () => {
      const now = [...pts.values()];
      const was = [...base.pts.values()];
      if (now.length === 0 || was.length === 0) return;
      const mid = (p: { x: number; y: number }[]) => ({
        x: p.reduce((a, q) => a + q.x, 0) / p.length,
        y: p.reduce((a, q) => a + q.y, 0) / p.length,
      });
      const m1 = mid(now);
      const m0 = mid(was);
      let scale = base.cur.scale;
      if (now.length >= 2 && was.length >= 2) {
        const d = (p: { x: number; y: number }[]) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        const d0 = d(was);
        if (d0 > 10) scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, base.cur.scale * (d(now) / d0)));
      }
      cur = {
        x: Math.max(0, Math.min(1, base.cur.x + (m1.x - m0.x) / board.width)),
        y: Math.max(0, Math.min(1, base.cur.y + (m1.y - m0.y) / board.height)),
        scale,
      };
      setLive(cur);
    };

    const own = (ev: globalThis.PointerEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    const down = (ev: globalThis.PointerEvent) => {
      if (pts.has(ev.pointerId)) return;
      own(ev);
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      used.add(ev.pointerId);
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
        rebase(); // one finger left: carry on dragging from here
        return;
      }
      finish();
      if (moved) place(st.id, cur);
    };
    // The lifted fingers' clicks would otherwise land on whatever is under
    // them. Only after a drag or pinch, and only those fingers' clicks -- a
    // tap on someone else's tile a moment later must still count.
    const swallowClick = (ev: MouseEvent) => {
      if (!moved) return;
      const id = (ev as globalThis.PointerEvent).pointerId;
      if (typeof id === "number" && id >= 0 && !used.has(id)) return;
      ev.stopPropagation();
      ev.preventDefault();
    };
    // Safari's own pinch-zoom of the page.
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

  const style = {
    left: `${shown.x * 100}%`,
    top: `${shown.y * 100}%`,
    transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${shown.scale})`,
  } as CSSProperties;

  return (
    <div
      className={`sticker${live ? " sticker--held" : ""}`}
      style={style}
      role="img"
      aria-label={`${def.name}; drag to move, pinch to resize`}
      title={def.name}
      data-sticker={st.id}
      onPointerDown={onDown}
    >
      <span aria-hidden>{def.icon}</span>
    </div>
  );
}
