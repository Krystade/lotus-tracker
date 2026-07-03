import { useEffect } from "react";
import { useStore } from "../state/store";

/**
 * Drives the game clock. Uses wall-clock timestamps so the countdown stays
 * accurate even if the browser throttles timers while backgrounded.
 */
export function useTicker(): void {
  const tick = useStore((s) => s.tick);

  useEffect(() => {
    let last = Date.now();
    const step = () => {
      const now = Date.now();
      const deltaSec = (now - last) / 1000;
      last = now;
      if (deltaSec > 0) tick(deltaSec);
    };
    const id = window.setInterval(step, 250);

    // Timers are throttled while the tab is hidden; catch up on real elapsed
    // time when we return so the total game clock (and turn countdown) stay
    // accurate rather than undercounting the backgrounded interval.
    const onVisible = () => {
      if (document.visibilityState === "visible") step();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tick]);
}
