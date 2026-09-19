import { describe, expect, it } from "vitest";
import { seeded } from "./rng";
import { MAX_WAIT_MS, MIN_WAIT_MS, judge, rankOf, waitMs } from "./draw";

describe("quick draw", () => {
  it("draws its wait from the whole band, never below the floor", () => {
    const rng = seeded(5);
    const waits = Array.from({ length: 200 }, () => waitMs(rng));
    expect(Math.min(...waits)).toBeGreaterThanOrEqual(MIN_WAIT_MS);
    expect(Math.max(...waits)).toBeLessThanOrEqual(MAX_WAIT_MS);
    // A band that never varies would be a metronome, which is a different game.
    expect(new Set(waits).size).toBeGreaterThan(50);
  });

  it("calls a tap before the flip a false start", () => {
    expect(judge(null, 1234)).toEqual({ kind: "early" });
  });

  it("measures from the flip, not from the start of the round", () => {
    const r = judge(1000, 1287);
    expect(r).toEqual({ kind: "time", ms: 287, rank: "Shock" });
  });

  it("never reports a negative time", () => {
    const r = judge(1000, 990);
    expect(r).toEqual({ kind: "time", ms: 0, rank: rankOf(0) });
  });

  it("ranks faster taps better, and the boundaries land on the fast side", () => {
    expect(rankOf(199)).toBe("Force of Will");
    expect(rankOf(200)).toBe("Lightning Bolt");
    expect(rankOf(259)).toBe("Lightning Bolt");
    expect(rankOf(260)).toBe("Shock");
    expect(rankOf(339)).toBe("Shock");
    expect(rankOf(340)).toBe("Sorcery speed");
    expect(rankOf(449)).toBe("Sorcery speed");
    expect(rankOf(450)).toBe("Land, go.");
    expect(rankOf(99999)).toBe("Land, go.");
  });
});
