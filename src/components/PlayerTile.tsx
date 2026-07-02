import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useStore } from "../state/store";
import { useHoldRepeat } from "../hooks/useHoldRepeat";
import { formatClock } from "../util/format";
import { isCommanderDamageLethal, isPoisonLethal } from "../game/lethal";
import { textOn } from "../layout/colors";
import type { Placement, Rotation, TilePos } from "../state/types";

interface Props {
  placement: Placement;
  onOpenDetail: (playerId: string) => void;
}

const DEFAULT_TIMER_POS: TilePos = { x: 50, y: 85 };
const DRAG_THRESHOLD = 6;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** Convert a screen-space drag delta into the tile's own (pre-rotation) axes. */
function screenToLocal(rot: Rotation, dx: number, dy: number): [number, number] {
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

export function PlayerTile({ placement, onOpenDetail }: Props) {
  const pid = placement.playerId;
  const player = useStore((s) => s.game.players.find((p) => p.id === pid));
  const turn = useStore((s) => s.game.turn);
  const scale = useStore((s) => s.settings.turnTimerScale);
  const timerEnabled = useStore((s) => s.settings.turnTimerEnabled);
  const adjustLife = useStore((s) => s.adjustLife);
  const passTurn = useStore((s) => s.passTurn);
  const setTimerPos = useStore((s) => s.setTimerPos);

  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sx: number; sy: number; base: TilePos; moved: boolean } | null>(
    null,
  );
  const [dragPos, setDragPos] = useState<TilePos | null>(null);

  const minus = useHoldRepeat((n) => adjustLife(pid, n), -1, -10);
  const plus = useHoldRepeat((n) => adjustLife(pid, n), 1, 10);

  if (!player) return null;

  const isActive = turn.activePlayerId === pid;
  const rotated = placement.rotation === 90 || placement.rotation === 270;
  const poisonDead = isPoisonLethal(player.counters.poison);
  const cmdrDead = isCommanderDamageLethal(player.commanderDamage);
  const lethal = player.life <= 0 || poisonDead || cmdrDead;
  const pillPos = dragPos ?? player.timerPos ?? DEFAULT_TIMER_POS;

  const contentStyle: CSSProperties = {
    transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
    width: rotated ? "100cqh" : "100%",
    height: rotated ? "100cqw" : "100%",
  };

  const tileStyle: CSSProperties = {
    gridRow: `${placement.row} / span ${placement.rowSpan}`,
    gridColumn: `${placement.col} / span ${placement.colSpan}`,
    background: player.color,
    color: textOn(player.color),
  };

  // Turn pill: a plain tap passes the turn; dragging repositions it (remembered
  // per player). Movement past a small threshold counts as a drag, not a tap.
  const onPillDown = (e: PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, base: pillPos, moved: false };
  };
  const onPillMove = (e: PointerEvent) => {
    const st = drag.current;
    const el = contentRef.current;
    if (!st || !el) return;
    const dx = e.clientX - st.sx;
    const dy = e.clientY - st.sy;
    if (!st.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    st.moved = true;
    const [lx, ly] = screenToLocal(placement.rotation, dx, dy);
    setDragPos({
      x: clamp(st.base.x + (lx / el.offsetWidth) * 100, 8, 92),
      y: clamp(st.base.y + (ly / el.offsetHeight) * 100, 8, 92),
    });
  };
  const onPillUp = (e: PointerEvent) => {
    e.stopPropagation();
    const st = drag.current;
    drag.current = null;
    if (st?.moved && dragPos) {
      setTimerPos(pid, dragPos);
    } else if (st) {
      passTurn();
    }
    setDragPos(null);
  };

  return (
    <div
      className={`tile${player.eliminated ? " tile--out" : ""}${
        lethal ? " tile--lethal" : ""
      }`}
      style={tileStyle}
    >
      <div className="tile__content" ref={contentRef} style={contentStyle}>
        <button
          className="tile__adj tile__adj--minus"
          aria-label="decrease life"
          {...minus}
        >
          <span className="tile__sign">–</span>
        </button>
        <button
          className="tile__adj tile__adj--plus"
          aria-label="increase life"
          {...plus}
        >
          <span className="tile__sign">+</span>
        </button>

        <div className="tile__life">{player.life}</div>

        {lethal && <div className="tile__skull">☠</div>}

        <button
          className="tile__tax"
          onClick={() => onOpenDetail(pid)}
          aria-label="open counters"
        >
          TAX {player.counters.tax}
        </button>

        <button
          className="tile__more"
          onClick={() => onOpenDetail(pid)}
          aria-label="player details"
        >
          ⋯
        </button>

        {isActive && timerEnabled && (
          <button
            className={`tile__pill${turn.expired ? " tile__pill--expired" : ""}${
              dragPos ? " tile__pill--dragging" : ""
            }`}
            style={{
              left: `${pillPos.x}%`,
              top: `${pillPos.y}%`,
              fontSize: `calc(0.95rem * ${scale})`,
            }}
            onPointerDown={onPillDown}
            onPointerMove={onPillMove}
            onPointerUp={onPillUp}
            aria-label="turn timer: tap to pass turn, drag to move"
          >
            <span className="tile__pill-turn">{turn.turnNumber}</span>
            <span className="tile__pill-time">
              {formatClock(turn.remainingSec)}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
