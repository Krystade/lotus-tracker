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
