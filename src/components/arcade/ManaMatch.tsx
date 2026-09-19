import { useEffect, useRef, useState } from "react";
import { flip, isFaceUp, newMatch, resolve } from "../../game/arcade/match";
import { seeded } from "../../game/arcade/rng";
import { GLYPH_COLOR, GLYPH_LETTER, inkFor } from "./glyphs";

const FLIP_BACK_MS = 850;

/** A fresh shuffle each deal; the seed only exists so tests can pin one. */
const deal = () => newMatch(seeded((Math.random() * 2 ** 32) >>> 0));

export function ManaMatch({ onWin }: { onWin: (moves: number) => void }) {
  const [state, setState] = useState(deal);
  const timer = useRef<number | null>(null);
  // Report the win once per deal, not once per render.
  const reported = useRef(false);

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  // A mismatched pair stays up long enough to memorise, then turns back.
  useEffect(() => {
    if (state.up.length < 2) return;
    clear();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setState((s) => resolve(s));
    }, FLIP_BACK_MS);
  }, [state]);

  useEffect(() => {
    if (state.done && !reported.current) {
      reported.current = true;
      onWin(state.moves);
    }
  }, [state.done, state.moves, onWin]);

  const restart = () => {
    clear();
    reported.current = false;
    setState(deal());
  };

  return (
    <div className="arc">
      <div
        className={`arc__grid arc__grid--match${state.done ? " is-done" : ""}`}
      >
        {state.cards.map((card, i) => {
          const up = isFaceUp(state, i);
          return (
            <button
              key={card.id}
              className={`mcard${up ? " is-up" : ""}${card.matched ? " is-matched" : ""}`}
              style={
                up
                  ? { background: GLYPH_COLOR[card.glyph], color: inkFor(card.glyph) }
                  : undefined
              }
              // Aria has to describe the face-down card as face down, or a
              // screen reader would simply read the answers out.
              aria-label={up ? `${card.glyph} face up` : "face down card"}
              onClick={() => setState((s) => flip(s, i))}
            >
              {up ? GLYPH_LETTER[card.glyph] : "✦"}
            </button>
          );
        })}
      </div>

      <div className="arc__foot">
        <span className="arc__status">
          {state.done ? (
            <strong>
              Cleared in {state.moves} {state.moves === 1 ? "try" : "tries"}
            </strong>
          ) : (
            `${state.moves} ${state.moves === 1 ? "try" : "tries"}`
          )}
        </span>
        <button className="bigbtn bigbtn--ghost" onClick={restart}>
          {state.done ? "Deal again" : "Reshuffle"}
        </button>
      </div>
    </div>
  );
}
