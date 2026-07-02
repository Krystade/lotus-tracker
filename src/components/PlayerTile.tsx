import type { CSSProperties } from "react";
import { useStore } from "../state/store";
import { useHoldRepeat } from "../hooks/useHoldRepeat";
import { formatClock } from "../util/format";
import { isCommanderDamageLethal, isPoisonLethal } from "../game/lethal";
import { textOn } from "../layout/colors";
import type { Placement } from "../state/types";

interface Props {
  placement: Placement;
  onOpenDetail: (playerId: string) => void;
}

export function PlayerTile({ placement, onOpenDetail }: Props) {
  const pid = placement.playerId;
  const player = useStore((s) => s.game.players.find((p) => p.id === pid));
  const turn = useStore((s) => s.game.turn);
  const scale = useStore((s) => s.settings.turnTimerScale);
  const timerEnabled = useStore((s) => s.settings.turnTimerEnabled);
  const adjustLife = useStore((s) => s.adjustLife);
  const passTurn = useStore((s) => s.passTurn);

  const minus = useHoldRepeat(() => adjustLife(pid, -1));
  const plus = useHoldRepeat(() => adjustLife(pid, +1));

  if (!player) return null;

  const isActive = turn.activePlayerId === pid;
  const rotated = placement.rotation === 90 || placement.rotation === 270;
  const poisonDead = isPoisonLethal(player.counters.poison);
  const cmdrDead = isCommanderDamageLethal(player.commanderDamage);
  const lethal = player.life <= 0 || poisonDead || cmdrDead;

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

  return (
    <div
      className={`tile${player.eliminated ? " tile--out" : ""}${
        lethal ? " tile--lethal" : ""
      }`}
      style={tileStyle}
    >
      <div className="tile__content" style={contentStyle}>
        <button
          className="tile__zone tile__zone--minus"
          aria-label="minus one life"
          {...minus}
        >
          <span className="tile__sign">–</span>
        </button>
        <button
          className="tile__zone tile__zone--plus"
          aria-label="plus one life"
          {...plus}
        >
          <span className="tile__sign">+</span>
        </button>

        <div className="tile__life" aria-live="polite">
          {player.life}
        </div>

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
            className={`tile__pill${turn.expired ? " tile__pill--expired" : ""}`}
            style={{ fontSize: `calc(0.95rem * ${scale})` }}
            onClick={() => passTurn()}
            aria-label="pass turn"
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
