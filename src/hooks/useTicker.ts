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
    const id = window.setInterval(() => {
      const now = Date.now();
      const deltaSec = (now - last) / 1000;
      last = now;
      if (deltaSec > 0) tick(deltaSec);
    }, 250);

    const onVisible = () => {
      // Reset the reference point so we don't dump a huge delta after resume.
      last = Date.now();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tick]);
}
