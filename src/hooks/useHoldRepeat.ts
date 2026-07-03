import { useCallback, useEffect, useRef } from "react";

/**
 * Pointer handlers for a +/- control: a quick tap applies `tapAmount`, while
 * press-and-hold repeatedly applies `holdAmount` (default ±10) so you can swing
 * a life total fast. `onDelta` receives the signed amount to apply.
 */
export function useHoldRepeat(
  onDelta: (amount: number) => void,
  tapAmount: number,
  holdAmount: number,
) {
  const timerRef = useRef<number | null>(null);
  const heldRef = useRef(false);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    heldRef.current = false;
  }, []);

  // Stop any pending repeat if the component unmounts mid-hold.
  useEffect(() => stop, [stop]);

  const start = useCallback(() => {
    // Immediate single step on tap.
    onDelta(tapAmount);
    // After a short delay, begin repeating in larger increments.
    const repeat = () => {
      onDelta(holdAmount);
      timerRef.current = window.setTimeout(repeat, 200);
    };
    timerRef.current = window.setTimeout(() => {
      heldRef.current = true;
      repeat();
    }, 450);
  }, [onDelta, tapAmount, holdAmount]);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      start();
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      stop();
    },
    onPointerLeave: stop,
    onPointerCancel: stop,
  };
}
