import { describe, expect, it } from "vitest";
import { ARCADE_GAMES, formatBest, gameById, isBetter } from "./bests";

describe("arcade bests", () => {
  it("every game has a distinct id", () => {
    const ids = ARCADE_GAMES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
  });

  it("a lower score wins where lower is better", () => {
    expect(isBetter("match", 7, 9)).toBe(true);
    expect(isBetter("match", 9, 7)).toBe(false);
    expect(isBetter("draw", 210, 240)).toBe(true);
    expect(isBetter("draw", 240, 210)).toBe(false);
  });

  it("a higher score wins where higher is better", () => {
    expect(isBetter("chant", 9, 7)).toBe(true);
    expect(isBetter("chant", 7, 9)).toBe(false);
  });

  it("ties do not overwrite the record", () => {
    expect(isBetter("match", 7, 7)).toBe(false);
    expect(isBetter("chant", 7, 7)).toBe(false);
  });

  it("the first score of a game always counts", () => {
    expect(isBetter("match", 40, undefined)).toBe(true);
    expect(isBetter("chant", 0, undefined)).toBe(true);
  });

  it("refuses junk rather than storing it", () => {
    expect(isBetter("match", NaN, 9)).toBe(false);
    expect(isBetter("match", Infinity, 9)).toBe(false);
    expect(isBetter("nope", 1, undefined)).toBe(false);
    // The guard earns its keep with no record yet: junk would become the record.
    expect(isBetter("match", NaN, undefined)).toBe(false);
    expect(isBetter("chant", Infinity, undefined)).toBe(false);
    // A corrupt stored value must not block a real one.
    expect(isBetter("match", 7, NaN)).toBe(true);
  });

  it("formats with the game's own unit", () => {
    expect(formatBest("match", 8)).toBe("8 tries");
    expect(formatBest("chant", 12)).toBe("12 rounds");
    expect(formatBest("draw", 244)).toBe("244 ms");
    expect(gameById("nope")).toBeUndefined();
  });
});
