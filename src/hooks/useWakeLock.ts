import { useEffect } from "react";

/**
 * Keeps the screen awake via the Screen Wake Lock API while `enabled` is true.
 * Re-acquires the lock when the tab becomes visible again (the browser releases
 * it automatically on background). No-ops where the API is unsupported.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    if (!("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const request = async () => {
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Denied (e.g. low battery / not visible) — safe to ignore.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && !released) request();
    };

    request();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      sentinel?.release().catch(() => undefined);
    };
  }, [enabled]);
}
