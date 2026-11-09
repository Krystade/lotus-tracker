import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useStore } from "../state/store";
import { PlayerTile } from "./PlayerTile";
import { StickerLayer } from "./StickerLayer";
import { SeatDragLayer } from "./SeatDragLayer";
import { takeSlide } from "./seatDrag";
import { FreeformEditor } from "./FreeformEditor";
import { useLayoutEdit } from "./layoutEdit";
import { polyGeoms } from "../layout/freeform";

interface Props {
  onOpenDetail: (playerId: string) => void;
  /** Seats currently playing a pass-the-time game; any number at once. */
  arcadeSeats: string[];
  onCloseArcade: (playerId: string) => void;
}

const SLIDE_MS = 200;

/** Lays out the player tiles on a CSS grid defined by the active layout. */
export function Board({ onOpenDetail, arcadeSeats, onCloseArcade }: Props) {
  const layout = useStore((s) => s.game.layout);
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<Map<string, DOMRect>>(new Map());
  const editing = useLayoutEdit((s) => s.editing);

  // Freeform cells are cut in px (the 8px gaps), so they need the board size.
  const [size, setSize] = useState({ W: 0, H: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.W - r.width) < 0.5 && Math.abs(s.H - r.height) < 0.5 ? s : { W: r.width, H: r.height }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const geoms = useMemo(
    () => (layout.cells && size.W > 0 ? polyGeoms(layout.cells, size.W, size.H) : null),
    [layout.cells, size],
  );

  // When seats move, each tile slides from where it was to where it is now.
  useLayoutEffect(() => {
    const board = ref.current;
    if (!board) return;
    const tiles = [...board.querySelectorAll<HTMLElement>(".tile[data-pid]")];
    // Only seat moves slide; a new game or preset just appears.
    const reduce = !takeSlide() || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, DOMRect>();
    for (const el of tiles) {
      const now = el.getBoundingClientRect();
      next.set(el.dataset.pid!, now);
      const was = last.current.get(el.dataset.pid!);
      if (reduce || !was || !now.width || !now.height) continue;
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      const sx = was.width / now.width;
      const sy = was.height / now.height;
      if (Math.abs(dx) + Math.abs(dy) < 1 && Math.abs(sx - 1) + Math.abs(sy - 1) < 0.01) continue;
      el.animate(
        [
          { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
          { transformOrigin: "0 0", transform: "none" },
        ],
        { duration: SLIDE_MS, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
    }
    last.current = next;
  }, [layout]);

  const style: CSSProperties = {
    gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
    gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
  };

  return (
    <div className={`board${geoms ? " board--poly" : ""}${editing ? " board--editing" : ""}`} style={style} ref={ref}>
      {layout.placements.map((placement) => (
        <PlayerTile
          cell={geoms?.get(placement.playerId)}
          key={placement.playerId}
          placement={placement}
          onOpenDetail={onOpenDetail}
          arcadeOpen={arcadeSeats.includes(placement.playerId)}
          onCloseArcade={() => onCloseArcade(placement.playerId)}
          boardRef={ref}
        />
      ))}
      <StickerLayer boardRef={ref} />
      <SeatDragLayer boardRef={ref} />
      {editing && size.W > 0 && <FreeformEditor W={size.W} H={size.H} />}
    </div>
  );
}
