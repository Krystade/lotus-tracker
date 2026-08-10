import { useEffect, useRef, useState } from "react";
import { Digits } from "./Digits";

const DICE = [4, 6, 8, 10, 12, 20];
const COIN = 2;

export function DicePanel({ onClose }: { onClose: () => void }) {
  const [sides, setSides] = useState(20);
  const [result, setResult] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    },
    [],
  );

  const roll = (s: number) => {
    setSides(s);
    setRolling(true);
    if (timer.current !== null) window.clearInterval(timer.current);
    let ticks = 0;
    const draw = () => 1 + Math.floor(Math.random() * s);
    setResult(draw()); // immediate value for the new die (no stale label)
    timer.current = window.setInterval(() => {
      setResult(s === COIN ? Math.floor(Math.random() * 2) + 1 : draw());
      if (++ticks >= 9) {
        if (timer.current !== null) window.clearInterval(timer.current);
        timer.current = null;
        setRolling(false);
      }
    }, 55);
  };

  // A rolled number is read from every seat around the table, so 6 and 9 get
  // the standard underline. Coin flips and the empty state are plain text.
  const label =
    result === null ? (
      "—"
    ) : sides === COIN ? (
      result === 1 ? (
        "Heads"
      ) : (
        "Tails"
      )
    ) : (
      <Digits value={result} />
    );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel panel--center" onClick={(e) => e.stopPropagation()}>
        <div className="panel__head panel__head--dark">
          <span>Dice</span>
          <button className="panel__x" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="panel__body">
          <div
            className={`dice__result${rolling ? " dice__result--rolling" : ""}`}
            aria-live="polite"
          >
            {label}
          </div>
          <div className="chipgrid">
            {DICE.map((s) => (
              <button
                key={s}
                className={`chip${sides === s ? " is-on" : ""}`}
                onClick={() => roll(s)}
              >
                d{s}
              </button>
            ))}
            <button
              className={`chip${sides === COIN ? " is-on" : ""}`}
              onClick={() => roll(COIN)}
            >
              Coin
            </button>
          </div>
          <button className="bigbtn" onClick={() => roll(sides)}>
            Roll {sides === COIN ? "coin" : `d${sides}`}
          </button>
        </div>
      </div>
    </div>
  );
}
