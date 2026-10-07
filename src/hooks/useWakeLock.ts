import { useEffect } from "react";

// Two seconds of 64x64 black with no audio track, as H.264 baseline (iOS) and
// VP8 (anything without H.264). Inlined so they need no request, no base path
// and no service-worker cache entry.
const SILENT_MP4 = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMrbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAlZ0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAEAAAABAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAHObWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABeW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAATlzdGJsAAAAuXN0c2QAAAAAAAAAAQAAAKlhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAEAAQABIAAAASAAAAAAAAAABFUxhdmM2MS4xOS4xMDAgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAAL2F2Y0MBQsAe/+EAF2dCwB7ZBCbARAAAAwAEAAADAAg8WLkgAQAFaMuDyyAAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAAKcAAACnAAAAAYc3R0cwAAAAAAAAABAAAAAgAAQAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAAgAAAAEAAAAcc3RzegAAAAAAAAAAAAAAAgAAApIAAAAKAAAAFHN0Y28AAAAAAAAAAQAAA1sAAABhdWR0YQAAAFltZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAACxpbHN0AAAAJKl0b28AAAAcZGF0YQAAAAEAAAAATGF2ZjYxLjcuMTAwAAAACGZyZWUAAAKkbWRhdAAAAnAGBf//bNxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjQgcjMxOTIgYzI0ZTA2YyAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjQgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0wIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDE6MHgxMTEgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTAgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0yIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MCB3ZWlnaHRwPTAga2V5aW50PTI1MCBrZXlpbnRfbWluPTEgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAaZYiEBb///w9FAAFPfycnJ1111111111114AAAAAGQZo4CvhG";
const SILENT_WEBM = "data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAIMEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggH27AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjEuNy4xMDBXQYxMYXZmNjEuNy4xMDBEiYhAn0AAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WIfTdSyJLZcoicgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4Q7msoA4JCwgUC6gUCagQJVsIRVuYEBElTDZ/tzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYxLjcuMTAwc3PWY8CLY8WIfTdSyJLZcohnyKFFo4dFTkNPREVSRIeUTGF2YzYxLjE5LjEwMCBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAyLjAwMDAwMDAwMAAfQ7Z1zueBAKOqgQAAgPACAJ0BKkAAQAAARwiFhYiZhIgCggAGcDxCYAqyIPcwAP7/j7wAo52BA+gAMQIAARAQABgAGdf0DAABLAYApgD+/6tQgBxTu2uRu4+zgQC3iveBAfGCAaPwgQM=";

/**
 * Keeps the screen awake while `enabled` is true.
 *
 * Uses the Screen Wake Lock API, and holds on to it: the browser drops the lock
 * on background and sometimes while visible (battery saver), and a request can
 * be refused outright, so it is re-requested on return, on release, and on the
 * next tap. Where the API is missing or refuses, a muted inline looping video
 * does the same job — playing media keeps iOS and Android from dimming. An iOS
 * home-screen app runs the video as well, because before iOS 18.4 the API
 * resolved there without actually doing anything.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const native = "wakeLock" in navigator;
    const iosStandalone =
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    let sentinel: WakeLockSentinel | null = null;
    let pending = false;
    let video: HTMLVideoElement | null = null;
    let stopped = false;

    const playVideo = () => {
      if (!video) {
        video = document.createElement("video");
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.setAttribute("muted", "");
        video.src = video.canPlayType("video/mp4") ? SILENT_MP4 : SILENT_WEBM;
        // Old WebKit lets the screen sleep once a looping clip wraps; keep it
        // from ever reaching the end.
        video.addEventListener("timeupdate", () => {
          if (video && video.currentTime > 0.5) video.currentTime = Math.random() * 0.5;
        });
      }
      if (video.paused) video.play().catch(() => undefined);
    };

    const acquire = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      if (iosStandalone || !native) playVideo();
      if (!native || pending || (sentinel && !sentinel.released)) return;
      pending = true;
      try {
        const s = await navigator.wakeLock.request("screen");
        if (stopped) {
          s.release().catch(() => undefined);
          return;
        }
        sentinel = s;
        s.addEventListener("release", () => {
          if (sentinel === s) sentinel = null;
          acquire();
        });
      } catch {
        // Refused (no user activation yet, battery saver, policy). Hold the
        // screen with the video meanwhile; the next tap asks again.
        playVideo();
      } finally {
        pending = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };
    const onTap = () => {
      // Video play() and the lock request both count a tap as user activation.
      if ((native && !sentinel) || (video && video.paused)) acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("pointerdown", onTap, { capture: true, passive: true });

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("pointerdown", onTap, { capture: true });
      const s = sentinel;
      sentinel = null;
      s?.release().catch(() => undefined);
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [enabled]);
}
