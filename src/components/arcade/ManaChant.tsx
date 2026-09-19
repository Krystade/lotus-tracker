import { useCallback, useEffect, useRef, useState } from "react";
import { extend, newChant, press, type ChantState } from "../../game/arcade/chant";
import { seeded } from "../../game/arcade/rng";
import { PADS, type Pad } from "../../game/arcade/symbols";
import { GLYPH_COLOR, GLYPH_LETTER, inkFor } from "./glyphs";

const LIT_MS = 400;
const GAP_MS = 190;
const BEFORE_REPLAY_MS = 650;

type Phase = "idle" | "showing" | "input" | "over";

const rng = () => seeded((Math.random() * 2 ** 32) >>> 0);

export function ManaChant({ onEnd }: { onEnd: (score: number) => void }) {
  const [state, setState] = useState<ChantState | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [lit, setLit] = useState<Pad | null>(null);
  const [wrongPad, setWrongPad] = useState<Pad | null>(null);
  // Every timer this component owns, so unmounting mid-playback cannot leave
  // one running against a dead component.
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  /** Light the sequence one pad at a time, then hand control back. */
  const playBack = useCallback(
    (sequence: Pad[]) => {
      clearTimers();
      setPhase("showing");
      setLit(null);
      sequence.forEach((pad, i) => {
        const at = BEFORE_REPLAY_MS + i * (LIT_MS + GAP_MS);
        timers.current.push(
          window.setTimeout(() => setLit(pad), at),
          window.setTimeout(() => setLit(null), at + LIT_MS),
        );
      });
      timers.current.push(
        window.setTimeout(
          () => setPhase("input"),
          BEFORE_REPLAY_MS + sequence.length * (LIT_MS + GAP_MS),
        ),
      );
    },
    [clearTimers],
  );

  const start = () => {
    const s = newChant(rng());
    setState(s);
    setWrongPad(null);
    playBack(s.sequence);
  };

  const tap = (pad: Pad) => {
    if (phase !== "input" || !state) return;
    // Flash the tapped pad whatever the verdict, so the input feels answered.
    setLit(pad);
    timers.current.push(window.setTimeout(() => setLit(null), 140));

    const r = press(state, pad);
    setState(r.state);
    if (r.wrong) {
      clearTimers();
      setWrongPad(pad);
      setPhase("over");
      onEnd(r.state.score);
      return;
    }
    if (r.roundComplete) {
      const next = extend(r.state, rng());
      setState(next);
      timers.current.push(window.setTimeout(() => playBack(next.sequence), 500));
      setPhase("showing");
    }
  };

  const status = () => {
    if (!state) return "Watch the colours, then play them back.";
    if (phase === "over") return `Broken at round ${state.score + 1}`;
    if (phase === "showing") return `Round ${state.score + 1} — watch`;
    return `Round ${state.score + 1} — your turn (${state.at}/${state.sequence.length})`;
  };

  return (
    <div className="arc">
      <div className="arc__status" aria-live="polite">
        {phase === "over" ? <strong>{status()}</strong> : status()}
      </div>

      <div className="arc__grid arc__grid--pads">
        {PADS.map((pad) => (
          <button
            key={pad}
            className={`pad${lit === pad ? " is-lit" : ""}${wrongPad === pad ? " is-wrong" : ""}`}
            style={{ background: GLYPH_COLOR[pad], color: inkFor(pad) }}
            // Disabled during playback so a stray tap is not read as an answer.
            disabled={phase !== "input"}
            onClick={() => tap(pad)}
            aria-label={pad}
          >
            {GLYPH_LETTER[pad]}
          </button>
        ))}
      </div>

      {/* Pink only when starting over is the thing to do; mid-run it is an
          escape hatch and should not be the loudest thing on screen. */}
      <button
        className={`bigbtn${phase === "input" ? " bigbtn--ghost" : ""}`}
        onClick={start}
        disabled={phase === "showing"}
      >
        {state === null ? "Start" : phase === "over" ? "Again" : "Restart"}
      </button>
    </div>
  );
}
