import { useState } from "react";
import { useStore } from "../state/store";

const LIFE_PRESETS = [20, 30, 40];

interface Props {
  onClose: () => void;
}

export function NewGameScreen({ onClose }: Props) {
  const currentCount = useStore((s) => s.game.players.length);
  const currentLife = useStore((s) => s.game.startingLife);
  const newGame = useStore((s) => s.newGame);

  const [count, setCount] = useState(currentCount);
  const [life, setLife] = useState(currentLife);
  const [customLife, setCustomLife] = useState("");

  const isCustom = customLife.trim() !== "";

  const start = () => {
    newGame({ playerCount: count, startingLife: life });
    onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel panel--center" onClick={(e) => e.stopPropagation()}>
        <div className="panel__head panel__head--dark">
          <span>New game</span>
          <button className="panel__x" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="panel__body">
          <section className="panel__section">
            <h3>Players</h3>
            <div className="chipgrid">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  className={`chip${count === n ? " is-on" : ""}`}
                  onClick={() => setCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </section>

          <section className="panel__section">
            <h3>Starting life</h3>
            <div className="chipgrid">
              {LIFE_PRESETS.map((n) => (
                <button
                  key={n}
                  className={`chip${life === n && !isCustom ? " is-on" : ""}`}
                  onClick={() => {
                    setLife(n);
                    setCustomLife("");
                  }}
                >
                  {n}
                </button>
              ))}
              <input
                className={`chip chip--input${isCustom ? " is-on" : ""}`}
                type="number"
                inputMode="numeric"
                placeholder="Custom"
                value={customLife}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomLife(v);
                  const n = Number(v);
                  if (v.trim() !== "" && Number.isFinite(n)) setLife(n);
                }}
              />
            </div>
          </section>

          <button className="bigbtn" onClick={start}>
            Start game
          </button>
          <p className="panel__note">
            Resets life, counters, and turn order for {count} player
            {count === 1 ? "" : "s"} at {life} life.
          </p>
        </div>
      </div>
    </div>
  );
}
