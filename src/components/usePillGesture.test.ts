import { describe, expect, it } from "vitest";
import { snapAngle } from "./usePillGesture";
import { cleanTimerPos } from "../state/sanitize";

describe("turn timer pinch", () => {
  it("snaps near-square turns to square, leaves others", () => {
    expect(snapAngle(7)).toBe(0);
    expect(snapAngle(-8)).toBe(0);
    expect(snapAngle(95)).toBe(90);
    expect(snapAngle(355)).toBe(0);
    expect(snapAngle(45)).toBe(45);
  });
  it("cleans saved size and turn", () => {
    expect(cleanTimerPos({ x: 50, y: 50, scale: 99, angle: -90 })).toEqual({ x: 50, y: 50, scale: 3, angle: 270 });
    expect(cleanTimerPos({ x: 50, y: 50 })).toEqual({ x: 50, y: 50 });
    expect(cleanTimerPos({ x: "a", y: 1 })).toBeUndefined();
  });
});
