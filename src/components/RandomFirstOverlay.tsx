import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { clockwiseSeatOrder, sortBySeatOrder } from "../layout/order";

export function RandomFirstOverlay({ onClose }: { onClose: () => void }) {
  // Select the stable players array, then filter in-render (a filtered selector
  // returns a new array each call and would loop).
  const allPlayers = useStore((s) => s.game.players);
  const layout = useStore((s) => s.game.layout);
  const setFirstPlayer = useStore((s) => s.setFirstPlayer);
  // Seats shown the way turns run, so the spin reads round the table.
  const players = sortBySeatOrder(
    allPlayers.filter((p) => !p.eliminated),
    clockwiseSeatOrder(layout),
  );

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (players.length === 0) {
      onClose();
      return;
    }
    if (players.length === 1) {
      // No spin needed for a single eligible seat.
      setHighlightId(players[0].id);
      setChosenId(players[0].id);
      return;
    }
    // Random start + a fixed number of decelerating steps => a random landing.
    // Nothing is committed until the player taps "Start".
    let i = Math.floor(Math.random() * players.length);
    let delay = 55;
    const step = () => {
      const cur = players[i % players.length];
      setHighlightId(cur.id);
      i++;
      delay += 14;
      if (delay < 290) {
        timer.current = window.setTimeout(step, delay);
      } else {
        setChosenId(cur.id);
      }
    };
    timer.current = window.setTimeout(step, delay);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosen = players.find((p) => p.id === chosenId);

  return (
    <div className="overlay" onClick={chosenId ? onClose : undefined}>
      <div className="panel panel--center" onClick={(e) => e.stopPropagation()}>
        <div className="panel__head panel__head--dark">
          <span>Who goes first?</span>
          <button className="panel__x" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="panel__body">
          <div className="rand__grid">
            {players.map((p) => (
              <div
                key={p.id}
                data-player-id={p.id}
                className={`rand__seat${
                  highlightId === p.id ? " rand__seat--on" : ""
                }${chosenId === p.id ? " rand__seat--won" : ""}`}
                style={{ background: p.color }}
              >
                {p.name}
              </div>
            ))}
          </div>
          <div className="rand__result" aria-live="polite">
            {chosen ? `🏁 ${chosen.name} goes first` : "Rolling…"}
          </div>
          {chosen && (
            <button
              className="bigbtn"
              onClick={() => {
                setFirstPlayer(chosen.id);
                onClose();
              }}
            >
              Start
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
