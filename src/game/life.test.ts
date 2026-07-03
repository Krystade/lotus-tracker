import { describe, expect, it } from "vitest";
import {
  applyLifeDelta,
  clampCounter,
  clampLife,
  clampStartingLife,
  LIFE_MAX,
  LIFE_MIN,
} from "./life";

describe("life math", () => {
  it("adds and subtracts", () => {
    expect(applyLifeDelta(40, -1)).toBe(39);
    expect(applyLifeDelta(40, 5)).toBe(45);
  });

  it("allows negative life (dead but tracked)", () => {
    expect(applyLifeDelta(1, -3)).toBe(-2);
  });

  it("clamps to sane bounds", () => {
    expect(clampLife(999999)).toBe(LIFE_MAX);
    expect(clampLife(-999999)).toBe(LIFE_MIN);
  });

  it("counters never go below zero", () => {
    expect(clampCounter(-1)).toBe(0);
    expect(clampCounter(3)).toBe(3);
  });

  it("guards non-finite life (NaN/Infinity) to a safe number", () => {
    expect(clampLife(NaN)).toBe(0);
    expect(clampLife(Infinity)).toBe(LIFE_MAX);
    expect(applyLifeDelta(NaN, 1)).toBe(0);
  });

  it("clamps starting life to a sane finite range", () => {
    expect(clampStartingLife(40)).toBe(40);
    expect(clampStartingLife(0)).toBe(1);
    expect(clampStartingLife(-5)).toBe(1);
    expect(clampStartingLife(99999)).toBe(999);
    expect(clampStartingLife(NaN)).toBe(40);
  });
});
