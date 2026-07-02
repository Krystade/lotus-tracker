import { describe, expect, it } from "vitest";
import { applyLifeDelta, clampCounter, clampLife, LIFE_MAX, LIFE_MIN } from "./life";

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
});
