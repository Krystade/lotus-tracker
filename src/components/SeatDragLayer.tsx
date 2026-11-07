import { useEffect, useState, type CSSProperties } from "react";
import { useStore } from "../state/store";
import { FACING, pxRects, type PxRect, type Side } from "../layout/table";
import type { Rotation } from "../state/types";
import { closeFacing, faceSeat, touchFacing, undoSeats, useSeatUi, type SeatDrag } from "./seatDrag";

const rectStyle = (r: PxRect, inset = 0): CSSProperties => ({
  left: r.x + inset,
  top: r.y + inset,
  width: Math.max(0, r.w - inset * 2),
  height: Math.max(0, r.h - inset * 2),
});

/** Drag preview, undo and facing picker for moving seats, over the board. */
export function SeatDragLayer({ boardRef }: { boardRef: React.RefObject<HTMLDivElement> }) {
  const drag = useSeatUi((s) => s.drag);
  const undo = useSeatUi((s) => s.undo);
  const facing = useSeatUi((s) => s.facing);
  const flash = useSeatUi((s) => s.flash);
  const layout = useStore((s) => s.game.layout);
  const players = useStore((s) => s.game.players);
  const [size, setSize] = useState<{ W: number; H: number; gap: number } | null>(null);

  // Board size for the undo / facing / flash overlays, which follow the layout.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const read = () =>
      setSize({ W: el.clientWidth, H: el.clientHeight, gap: parseFloat(getComputedStyle(el).rowGap) || 8 });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [boardRef]);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-seat-drag", !!drag && !drag.arming);
    return () => document.documentElement.removeAttribute("data-seat-drag");
  }, [drag]);

  const now = size ? pxRects(layout, size.W, size.H, size.gap) : null;
  const rotOf = (pid: string) => layout.placements.find((p) => p.playerId === pid)?.rotation ?? 0;
  const nameOf = (pid: string) => players.find((p) => p.id === pid)?.name ?? pid;

  return (
    <div className="seatlayer">
      {drag && !drag.arming && <DragView drag={drag} nameOf={nameOf} colorOf={(pid) => players.find((p) => p.id === pid)?.color ?? "#fff"} rotOf={rotOf} lifeOf={(pid) => players.find((p) => p.id === pid)?.life ?? 0} />}

      {now && flash && now[flash] && <div className="seatflash" style={rectStyle(now[flash], -3)} />}

      {now &&
        undo &&
        !drag &&
        undo.pids.map((pid) =>
          now[pid] && facing?.pid !== pid ? (
            <div key={pid} className="seatundo-wrap" style={rectStyle(now[pid])}>
              <button
                className="seatundo"
                style={{
                  // Towards the player's own top edge, clear of the life total.
                  transform: `translate(-50%, -50%) rotate(${rotOf(pid)}deg) translateY(-${Math.round(
                    (rotOf(pid) % 180 ? now[pid].w : now[pid].h) * 0.3,
                  )}px)`,
                }}
                onClick={undoSeats}
                aria-label="undo seat move"
              >
                ↺ Undo
              </button>
            </div>
          ) : null,
        )}

      {now && facing && now[facing.pid] && (
        <FacingPicker r={now[facing.pid]} current={rotOf(facing.pid)} pid={facing.pid} name={nameOf(facing.pid)} />
      )}
    </div>
  );
}

const ARROWS: { side: Side; glyph: string }[] = [
  { side: "top", glyph: "▲" },
  { side: "right", glyph: "▶" },
  { side: "bottom", glyph: "▼" },
  { side: "left", glyph: "◀" },
];

function FacingPicker({ r, current, pid, name }: { r: PxRect; current: Rotation; pid: string; name: string }) {
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(".seatfacing")) closeFacing();
    };
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, []);
  return (
    <div className="seatfacing" style={rectStyle(r)} onPointerDown={touchFacing}>
      <div className="seatfacing__label" style={{ transform: `translate(-50%, -50%) rotate(${current}deg)` }}>
        {name}: face which edge?
      </div>
      {ARROWS.map(({ side, glyph }) => (
        <button
          key={side}
          className={`seatfacing__btn seatfacing__btn--${side}${FACING[side] === current ? " is-on" : ""}`}
          onClick={() => faceSeat(pid, FACING[side])}
          aria-label={`face the ${side} edge`}
        >
          {glyph}
        </button>
      ))}
    </div>
  );
}

function DragView({
  drag,
  nameOf,
  colorOf,
  rotOf,
  lifeOf,
}: {
  drag: SeatDrag;
  nameOf: (pid: string) => string;
  colorOf: (pid: string) => string;
  rotOf: (pid: string) => Rotation;
  lifeOf: (pid: string) => number;
}) {
  const { pid, rects, plan, target, W, H, gap } = drag;
  const others = Object.keys(rects).filter((id) => id !== pid);

  // The result: only tiles whose rect changes, outlined at their new spot.
  let preview: { id: string; r: PxRect; rot: Rotation }[] = [];
  if (target.kind === "move") {
    const next = pxRects(target.move.grid, W, H, gap);
    preview = target.move.grid.placements
      .filter((p) => {
        const a = rects[p.playerId];
        const b = next[p.playerId];
        return p.playerId === pid || !a || Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.w - b.w) + Math.abs(a.h - b.h) > 2;
      })
      .map((p) => ({ id: p.playerId, r: next[p.playerId], rot: p.rotation }));
  }
  const moverRot: Rotation =
    target.kind === "move" ? target.move.grid.placements.find((p) => p.playerId === pid)!.rotation : rotOf(pid);
  const endBar = target.kind === "move" ? endOf(target.move) : null;

  return (
    <>
      <div className={`seatrail seatrail--top${plan.locked.top ? " is-locked" : ""}`} />
      <div className={`seatrail seatrail--bottom${plan.locked.bottom ? " is-locked" : ""}`} />
      {plan.table && <div className="seatsplit" />}
      {endBar && <div className={`seatbar seatbar--${endBar}`} style={{ background: colorOf(pid) }} />}

      {others.map((id) => {
        const r = rects[id];
        const on = target.kind === "swap" && target.with === id;
        return (
          <div
            key={id}
            className={`seatdisc${on ? " is-on" : ""}`}
            style={{ left: r.x + r.w / 2, top: r.y + r.h / 2, borderColor: colorOf(id), background: on ? colorOf(id) : undefined }}
          >
            ⇄
          </div>
        );
      })}
      {rects[pid] && (
        <div
          className={`seatdisc seatdisc--home${target.kind === "home" ? " is-on" : ""}`}
          style={{ left: rects[pid].x + rects[pid].w / 2, top: rects[pid].y + rects[pid].h / 2 }}
        >
          ⟲
        </div>
      )}

      {preview.map(({ id, r, rot }) => (
        <div key={id} className={`seatghost${id === pid ? " seatghost--me" : ""}`} style={{ ...rectStyle(r, 4), borderColor: id === pid ? colorOf(id) : undefined }}>
          <span className="seatghost__pill" style={{ background: colorOf(id), transform: `translate(-50%, -50%) rotate(${rot}deg)` }}>
            {nameOf(id)}
            {id === pid ? ` ${ARROWS.find((a) => FACING[a.side] === rot)?.glyph ?? ""}` : ""}
          </span>
        </div>
      ))}
      {target.kind === "swap" && rects[target.with] && (
        <>
          <div className="seatghost seatghost--me" style={{ ...rectStyle(rects[target.with], 4), borderColor: colorOf(pid) }}>
            <span className="seatghost__pill" style={{ background: colorOf(pid), transform: `translate(-50%, -50%) rotate(${rotOf(target.with)}deg)` }}>
              {nameOf(pid)}
            </span>
          </div>
          <div className="seatghost" style={rectStyle(rects[pid], 4)}>
            <span className="seatghost__pill" style={{ background: colorOf(target.with), transform: `translate(-50%, -50%) rotate(${rotOf(pid)}deg)` }}>
              {nameOf(target.with)}
            </span>
          </div>
        </>
      )}

      <div
        className="seatchip"
        style={{
          left: Math.min(Math.max(drag.x, 28), W - 28),
          top: Math.min(Math.max(drag.y - 64, 28), H - 28),
          background: colorOf(pid),
          transform: `translate(-50%, -50%) rotate(${moverRot}deg)`,
        }}
      >
        <span className="seatchip__name">{nameOf(pid)}</span>
        <span className="seatchip__life">{lifeOf(pid)}</span>
      </div>
      {target.kind === "locked" && <div className={`seatlock seatlock--${target.side}`}>🔒 2 max</div>}
    </>
  );
}

function endOf(m: import("../layout/table").Move): Side | null {
  if (m.kind === "slot") return m.side;
  if (m.kind === "strip") return m.edge;
  return null;
}
