import { useEffect, useRef, useState } from "react";
import { feedbackFor, vibrationFor, type Feedback } from "../game/feedback";
import { vibrate } from "../util/alert";

/** How long each tier's effect stays on screen, in ms. */
const DURATION: Record<Feedback["intensity"], number> = {
  1: 260,
  2: 400,
  3: 650,
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

  useEffect(() => {
    const before = prev.current;
    prev.current = { life, dead };
    if (before.life === life && before.dead === dead) return;
    if (!enabled) return;

    const next = feedbackFor(before, { life, dead });
    if (!next) return;

    setEffect(next);
    if (haptics) {
      const pattern = vibrationFor(next);
      if (pattern !== 0) vibrate(pattern);
    }
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setEffect(null),
      DURATION[next.intensity],
    );
  }, [life, dead, enabled, haptics]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return effect;
}
