import { useStore } from "../state/store";
import { textOn } from "../layout/colors";
import { isPlayerDead } from "../game/lethal";

interface Props {
  onPick: (playerId: string) => void;
  onClose: () => void;
}

/**
 * Asks whose seat the games should open in.
 *
 * They play inside that player's own tile rather than over the middle of the
 * board, which is the only arrangement that leaves the life totals readable
 * and the tiles tappable for whoever's turn it actually is. The seat also
 * settles which way up the games face, with no control needed for it.
 */
export function ArcadeSeatPicker({ onPick, onClose }: Props) {
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
            Games open in your own seat, so the board stays readable for
            whoever is taking their turn.
          </p>
          <div className="seatpick">
            {players.map((p) => (
              <button
                key={p.id}
                className="seatpick__seat"
                style={{ background: p.color, color: textOn(p.color) }}
                onClick={() => onPick(p.id)}
                aria-label={`play in ${p.name}'s seat`}
              >
                <span className="seatpick__name">{p.name}</span>
                {p.id === activeId && (
                  <span className="seatpick__tag">your turn</span>
                )}
                {isPlayerDead(p) && <span className="seatpick__tag">out</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
