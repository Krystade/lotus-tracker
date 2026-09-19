import { useStore } from "../state/store";
import { textOn } from "../layout/colors";
import { isPlayerDead } from "../game/lethal";

interface Props {
  /** Seats that already have games open. */
  open: string[];
  onToggle: (playerId: string) => void;
  onClose: () => void;
}

/**
 * Picks which seats are playing. More than one at a time: four people waiting
 * on the same long turn is the normal case, and making them share a single
 * game of pairs on a shared phone is not a design, it is a queue.
 *
 * Games run inside each player's own tile, which is the only arrangement that
 * leaves the life totals readable and the tiles tappable for whoever's turn
 * it actually is. The seat also settles which way up its games face.
 */
export function ArcadeSeatPicker({ open, onToggle, onClose }: Props) {
  const players = useStore((s) => s.game.players);
  const activeId = useStore((s) => s.game.turn.activePlayerId);

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="panel panel--center panel--seatpick"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="panel__head panel__head--dark">
          <span>Pass the time</span>
          <button className="panel__x" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="panel__body">
          <p className="panel__note">
            Tap any seats that want something to do. Each one plays in their
            own tile, independently, and the rest of the board stays readable
            for whoever is taking their turn.
          </p>
          <div className="seatpick">
            {players.map((p) => {
              const on = open.includes(p.id);
              return (
                <button
                  key={p.id}
                  className={`seatpick__seat${on ? " is-on" : ""}`}
                  style={{ background: p.color, color: textOn(p.color) }}
                  onClick={() => onToggle(p.id)}
                  aria-pressed={on}
                  aria-label={`${on ? "stop" : "start"} games in ${p.name}'s seat`}
                >
                  <span className="seatpick__name">
                    {on && <span aria-hidden>✓ </span>}
                    {p.name}
                  </span>
                  <span className="seatpick__tag">
                    {on
                      ? "playing"
                      : p.id === activeId
                        ? "your turn"
                        : isPlayerDead(p)
                          ? "out"
                          : " "}
                  </span>
                </button>
              );
            })}
          </div>
          <button className="bigbtn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
