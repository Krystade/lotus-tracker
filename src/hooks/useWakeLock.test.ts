import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useWakeLock } from "./useWakeLock";

type FakeSentinel = EventTarget & { released: boolean; release: () => Promise<void> };

function fakeSentinel(): FakeSentinel {
  const s = new EventTarget() as FakeSentinel;
  s.released = false;
  s.release = async () => {
    s.released = true;
    s.dispatchEvent(new Event("release"));
  };
  return s;
}

const flush = () => act(async () => {});

let request: ReturnType<typeof vi.fn>;
let play: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  request = vi.fn(async () => fakeSentinel());
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  delete (navigator as { wakeLock?: unknown }).wakeLock;
  delete (navigator as { standalone?: unknown }).standalone;
  vi.restoreAllMocks();
});

describe("useWakeLock", () => {
  it("requests a screen lock when enabled", async () => {
    renderHook(() => useWakeLock(true));
    await flush();
    expect(request).toHaveBeenCalledWith("screen");
    expect(play).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", async () => {
    renderHook(() => useWakeLock(false));
    await flush();
    expect(request).not.toHaveBeenCalled();
  });

  it("re-acquires when the system drops the lock while the page stays open", async () => {
    const first = fakeSentinel();
    request.mockResolvedValueOnce(first);
    renderHook(() => useWakeLock(true));
    await flush();
    await act(() => first.release());
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("retries on the next tap after a refused request", async () => {
    request.mockRejectedValueOnce(new DOMException("no", "NotAllowedError"));
    renderHook(() => useWakeLock(true));
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => {
      document.dispatchEvent(new Event("pointerdown"));
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not re-request on taps while a lock is held", async () => {
    renderHook(() => useWakeLock(true));
    await flush();
    await act(async () => {
      document.dispatchEvent(new Event("pointerdown"));
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("falls back to a muted looping video where the API is missing", async () => {
    delete (navigator as { wakeLock?: unknown }).wakeLock;
    renderHook(() => useWakeLock(true));
    await flush();
    expect(play).toHaveBeenCalled();
    const video = play.mock.contexts[0] as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.playsInline).toBe(true);
  });

  it("falls back to the video when the request is refused", async () => {
    request.mockRejectedValue(new DOMException("no", "NotAllowedError"));
    renderHook(() => useWakeLock(true));
    await flush();
    expect(play).toHaveBeenCalled();
  });

  it("also runs the video in an iOS home-screen app, where the lock was a no-op before iOS 18.4", async () => {
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    renderHook(() => useWakeLock(true));
    await flush();
    expect(request).toHaveBeenCalled();
    expect(play).toHaveBeenCalled();
  });

  it("releases everything when disabled", async () => {
    const s = fakeSentinel();
    request.mockResolvedValueOnce(s);
    const pause = HTMLMediaElement.prototype.pause as unknown as ReturnType<typeof vi.fn>;
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    const { rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await flush();
    rerender({ on: false });
    await flush();
    expect(s.released).toBe(true);
    expect(pause).toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
