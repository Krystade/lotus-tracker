import { useEffect } from "react";
import { useStore } from "../state/store";
import { textOn } from "../layout/colors";
import { COUNTER_LABELS, type CounterRef } from "./CounterChips";

interface Props {
  playerId: string;
  target: CounterRef;
  onClose: () => void;
}

/**
 * Compact +/- popover for a single counter, opened by tapping its chip on the
 * tile. Saves a trip through the full detail panel for the common case of
 * nudging poison or tax mid-turn. Rotated to face the seat, like the panel.
 */
export function CounterQuickAdjust({ playerId, target, onClose }: Props) {
  const players = useStore((s) => s.game.players);
  const rotation = useStore(
    (s) =>
      s.game.layout.placements.find((p) => p.playerId === playerId)?.rotation ??
      0,
  );
  const adjustCounter = useStore((s) => s.adjustCounter);
  const bumpTax = useStore((s) => s.bumpTax);
  const adjustCustomCounter = useStore((s) => s.adjustCustomCounter);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const player = players.find((p) => p.id === playerId);
  if (!player) return null;

  const custom =
    target.kind === "custom"
      ? player.counters.custom.find((c) => c.id === target.id)
      : undefined;
  // The counter can vanish under us (removed from the detail panel).
  if (target.kind === "custom" && !custom) return null;

  const label =
    target.kind === "custom"
      ? custom!.name
      : (COUNTER_LABELS.find(([k]) => k === target.key)?.[2] ?? target.key);
  const value =
    target.kind === "custom" ? custom!.value : player.counters[target.key];

  const step = (direction: 1 | -1) => {
    if (target.kind === "custom") {
      adjustCustomCounter(playerId, custom!.id, direction);
    } else if (target.key === "tax") {
      // Commander tax moves in twos, as it does in the detail panel.
      bumpTax(playerId, direction);
    } else {
      adjustCounter(playerId, target.key, direction);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="rot-wrap" style={{ transform: `rotate(${rotation}deg)` }}>
        <div
          className="quick"
          onClick={(e) => e.stopPropagation()}
          style={{ borderColor: player.color }}
        >
          <div
            className="quick__head"
            style={{ background: player.color, color: textOn(player.color) }}
          >
            {label}
          </div>
          <div className="quick__body">
            <button
              className="quick__btn"
              onClick={() => step(-1)}
              aria-label={`decrease ${label}`}
            >
              –
            </button>
            <span className="quick__val" aria-live="polite">
              {value}
            </span>
            <button
              className="quick__btn"
              onClick={() => step(1)}
              aria-label={`increase ${label}`}
            >
              +
            </button>
          </div>
          <button className="quick__done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
