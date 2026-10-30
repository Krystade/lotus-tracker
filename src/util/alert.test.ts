import { describe, expect, it } from "vitest";
import { fireTurnExpiredAlert, playBeep, unlockAudio, vibrate } from "./alert";

// jsdom has no AudioContext / navigator.vibrate; the utils must degrade quietly.
describe("alert utils", () => {
  it("never throw when audio/vibration are unavailable", () => {
    expect(() => unlockAudio()).not.toThrow();
    expect(() => playBeep()).not.toThrow();
    expect(() => vibrate()).not.toThrow();
    expect(() => fireTurnExpiredAlert(true, true)).not.toThrow();
    expect(() => fireTurnExpiredAlert(false, false)).not.toThrow();
  });
});

describe("playBeep", () => {
  // A recording stand-in for Web Audio: what was scheduled, at what level.
  function fakeAudio() {
    const oscs: { type: string; freq: number }[] = [];
    const ramps: { kind: string; value: number }[] = [];
    class Ctx {
      currentTime = 0;
      state = "running";
      destination = {};
      resume = () => Promise.resolve();
      createOscillator() {
        const o = {
          type: "",
          frequency: { value: 0, setValueAtTime() {} },
          connect() {},
          start() {},
          stop() {},
        };
        queueMicrotask(() => oscs.push({ type: o.type, freq: o.frequency.value }));
        return o;
      }
      createGain() {
        const rec = (kind: string) => (value: number) => ramps.push({ kind, value });
        return {
          gain: {
            value: 1,
            setValueAtTime: rec("set"),
            linearRampToValueAtTime: rec("linear"),
            exponentialRampToValueAtTime: rec("exp"),
          },
          connect() {},
        };
      }
    }
    return { Ctx, oscs, ramps };
  }

  async function play(volume: number) {
    const { vi } = await import("vitest");
    vi.resetModules();
    const fake = fakeAudio();
    (window as unknown as { AudioContext: unknown }).AudioContext = fake.Ctx;
    const mod = await import("./alert");
    mod.playBeep(volume);
    await Promise.resolve();
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    return fake;
  }

  it("is sines that fade in from silence, never a square switched on", async () => {
    const { oscs, ramps } = await play(0.5);
    expect(oscs.length).toBe(2);
    expect(oscs.every((o) => o.type === "sine")).toBe(true);
    expect(ramps[0]).toEqual({ kind: "set", value: 0 });
    expect(ramps[1].kind).toBe("linear");
  });

  it("gets quieter with the volume, and silent at zero", async () => {
    const peak = (r: { kind: string; value: number }[]) =>
      r.find((x) => x.kind === "linear")!.value;
    const loud = peak((await play(1)).ramps);
    const soft = peak((await play(0.3)).ramps);
    expect(soft).toBeLessThan(loud / 5);
    expect((await play(0)).oscs.length).toBe(0);
  });
});
