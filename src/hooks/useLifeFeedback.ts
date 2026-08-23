import { useEffect, useRef, useState } from "react";
import { feedbackFor, vibrationFor, type Feedback } from "../game/feedback";
import { vibrate } from "../util/alert";

/**
 * How long each tier's effect stays on screen, in ms.
 *
 * These MUST match --fx-dur in styles.css. They drifted 30-40ms short of it
 * once, which truncated the tail of every fade-out.
 */
const DURATION: Record<Feedback["intensity"], number> = {
  1: 300,
  2: 440,
  3: 680,
};

/**
 * Watches one player's life and returns the effect that should be playing
 * right now, clearing itself when it finishes. Fires the matching haptic as a
 * side effect.
 *
 * Deliberately silent on mount: the ref starts at the current values, so
 * loading a saved game does not set the whole table flashing.
 */
export function useLifeFeedback(
  life: number,
  dead: boolean,
  enabled: boolean,
  haptics: boolean,
): Feedback | null {
  const [effect, setEffect] = useState<Feedback | null>(null);
  const prev = useRef({ life, dead });
  const timer = useRef<number | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const before = prev.current;
    prev.current = { life, dead };
    if (before.life === life && before.dead === dead) return;
    if (!enabled) return;

    const next = feedbackFor(before, { life, dead });
    if (!next) return;

    if (haptics) {
      const pattern = vibrationFor(next);
      if (pattern !== 0) vibrate(pattern);
    }
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (frame.current !== null) cancelAnimationFrame(frame.current);

    // Clear first, then set on the next frame.
    //
    // Holding the minus button fires the same feedback over and over, so
    // setEffect would hand React an identical {kind, intensity} and the
    // rendered attributes would not change. An unchanged attribute is not
    // rewritten, and a CSS animation only restarts when its element or its
    // animation property changes -- so the wash played once and then sat at
    // opacity 0 while the life total kept dropping. Removing the attribute for
    // one frame is what makes the next hit visibly fire.
    setEffect(null);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setEffect(next);
      timer.current = window.setTimeout(
        () => setEffect(null),
        DURATION[next.intensity],
      );
    });
  }, [life, dead, enabled, haptics]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return effect;
}
