import { useEffect, useRef, useState } from "react";
import { judge, waitMs, type DrawResult } from "../../game/arcade/draw";
import { seeded } from "../../game/arcade/rng";

type Phase = "idle" | "waiting" | "go" | "done";

export function QuickDraw({ onTime }: { onTime: (ms: number) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<DrawResult | null>(null);
  const timer = useRef<number | null>(null);
  // performance.now, not Date.now: it is monotonic, so a clock adjustment
  // mid-round cannot produce a world-record reaction time.
  const flippedAt = useRef<number | null>(null);

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const arm = () => {
    clear();
    setResult(null);
    flippedAt.current = null;
    setPhase("waiting");
    timer.current = window.setTimeout(
      () => {
        timer.current = null;
        flippedAt.current = performance.now();
        setPhase("go");
      },
      waitMs(seeded((Math.random() * 2 ** 32) >>> 0)),
    );
  };

  const tap = () => {
    if (phase === "idle" || phase === "done") {
      arm();
      return;
    }
    clear();
    const verdict = judge(flippedAt.current, performance.now());
    setResult(verdict);
    setPhase("done");
    if (verdict.kind === "time") onTime(verdict.ms);
  };

  const face =
    phase === "waiting"
      ? { text: "Hold…", sub: "Wait for it" }
      : phase === "go"
        ? { text: "NOW", sub: "Tap!" }
        : result?.kind === "early"
          ? { text: "Too soon", sub: "Tap to try again" }
          : result?.kind === "time"
            ? { text: `${result.ms} ms`, sub: result.rank }
            : { text: "Quick Draw", sub: "Tap to begin" };

  return (
    <div className="arc">
      {/* One target covering the whole area: at speed nobody aims. Pointer
          down, not click — click fires on release, which adds the length of
          your own tap to the measurement. */}
      <button
        className={`draw draw--${phase}${result?.kind === "early" ? " draw--early" : ""}`}
        onPointerDown={tap}
        aria-live="polite"
      >
        <span className="draw__big">{face.text}</span>
        <span className="draw__sub">{face.sub}</span>
      </button>
    </div>
  );
}
