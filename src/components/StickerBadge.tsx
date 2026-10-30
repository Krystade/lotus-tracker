import { useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../state/store";
import { stickerDef } from "../game/stickers";
import type { StickerId } from "../state/types";

const DRAG_THRESHOLD = 8;

/**
 * A sticker on its holder's tile. Drag it onto another tile to hand it over.
 *
 * The tile clips its children and is rotated to its seat, so the thing that
 * follows the finger is a copy drawn on <body>, upright and unclipped; the
 * badge itself never leaves its tile. Where it lands is read from what is
 * under the finger, so any layout and rotation works the same.
 */
export function StickerBadge({ id, holder }: { id: StickerId; holder: string }) {
  const give = useStore((s) => s.giveSticker);
  const def = stickerDef(id);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [target, setTarget] = useState<string | null>(null);

  const seatAt = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y);
    const tile = el?.closest<HTMLElement>(".tile[data-pid]");
    return tile?.dataset.pid ?? null;
  };

  const onDown = (e: PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e: PointerEvent) => {
    const st = start.current;
    if (!st) return;
    if (!ghost && Math.hypot(e.clientX - st.x, e.clientY - st.y) < DRAG_THRESHOLD) return;
    setGhost({ x: e.clientX, y: e.clientY });
    const seat = seatAt(e.clientX, e.clientY);
    setTarget(seat && seat !== holder ? seat : null);
  };
  const finish = (e: PointerEvent, drop: boolean) => {
    e.stopPropagation();
    start.current = null;
    if (drop && ghost) {
      const seat = seatAt(e.clientX, e.clientY);
      if (seat && seat !== holder) give(id, seat);
    }
    setGhost(null);
    setTarget(null);
  };

  return (
    <>
      <button
        className={`tile__sticker${ghost ? " tile__sticker--lifted" : ""}`}
        aria-label={`${def.name}; drag to another player to hand it over`}
        title={def.name}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={(e) => finish(e, true)}
        onPointerCancel={(e) => finish(e, false)}
      >
        <span aria-hidden>{def.icon}</span>
      </button>
      {ghost &&
        createPortal(
          <>
            {target && <TileGlow pid={target} />}
            <div
              className="sticker-ghost"
              style={{ left: ghost.x, top: ghost.y }}
              aria-hidden
            >
              {def.icon}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

/** Outlines the tile the sticker would land on. */
function TileGlow({ pid }: { pid: string }) {
  const tile = document.querySelector<HTMLElement>(`.tile[data-pid="${pid}"]`);
  if (!tile) return null;
  const r = tile.getBoundingClientRect();
  return (
    <div
      className="sticker-drop"
      style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
      aria-hidden
    />
  );
}
