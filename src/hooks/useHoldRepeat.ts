import { useCallback, useRef } from "react";

/**
 * Returns pointer handlers that fire `onStep` once immediately, then repeatedly
 * while held — accelerating from ~3/s up to ~15/s the longer you hold. Good for
 * swinging a life total quickly without dozens of taps.
 */
export function useHoldRepeat(onStep: () => void) {
  const timerRef = useRef<number | null>(null);
  const heldMsRef = useRef(0);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    heldMsRef.current = 0;
  }, []);

  const start = useCallback(() => {
    onStep();
    const schedule = () => {
      heldMsRef.current += 1;
      // Accelerate: start at 320ms between repeats, ramp to 70ms.
      const held = heldMsRef.current;
      const delay = Math.max(70, 320 - held * 40);
      timerRef.current = window.setTimeout(() => {
        onStep();
        schedule();
      }, delay);
    };
    // Small initial pause before auto-repeat kicks in.
    timerRef.current = window.setTimeout(() => {
      onStep();
      schedule();
    }, 380);
  }, [onStep]);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      start();
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
  };
}
