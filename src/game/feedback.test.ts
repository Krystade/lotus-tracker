import { describe, expect, it } from "vitest";
import { feedbackFor, intensityFor, vibrationFor } from "./feedback";

const alive = (life: number) => ({ life, dead: false });
const dead = (life: number) => ({ life, dead: true });

describe("intensityFor", () => {
  it("treats a single point as the lightest tier", () => {
    expect(intensityFor(1)).toBe(1);
    expect(intensityFor(2)).toBe(1);
  });

  it("treats a few points as the middle tier", () => {
    expect(intensityFor(3)).toBe(2);
    expect(intensityFor(9)).toBe(2);
  });

  it("treats a press-and-hold swing as the heaviest tier", () => {
    expect(intensityFor(10)).toBe(3);
    expect(intensityFor(40)).toBe(3);
  });
});

describe("feedbackFor", () => {
  it("reports damage when life drops", () => {
    expect(feedbackFor(alive(40), alive(39))).toEqual({
      kind: "damage",
      intensity: 1,
    });
  });

  it("scales damage with the size of the hit", () => {
    expect(feedbackFor(alive(40), alive(19))?.intensity).toBe(3);
  });

  it("reports healing when life rises", () => {
    expect(feedbackFor(alive(30), alive(35))).toEqual({
      kind: "heal",
      intensity: 2,
    });
  });

  it("reports death when a player crosses into lethal", () => {
    expect(feedbackFor(alive(3), dead(0))).toEqual({
      kind: "death",
      intensity: 3,
    });
  });

  it("reports death even when life did not change", () => {
    // Poison and commander damage kill without touching the life total.
    expect(feedbackFor(alive(12), dead(12))?.kind).toBe("death");
  });

  it("does not re-report death on every later change", () => {
    expect(feedbackFor(dead(0), dead(-3))?.kind).toBe("damage");
  });

  it("reports nothing when nothing changed", () => {
    expect(feedbackFor(alive(40), alive(40))).toBeNull();
  });

  it("reports healing when a dead player is brought back up", () => {
    expect(feedbackFor(dead(0), alive(5))?.kind).toBe("heal");
  });
});

describe("vibrationFor", () => {
  // How long a pattern actually buzzes for. In the Vibration API an array
  // alternates on/off starting with ON, so the even indices are the buzzes and
  // the odd ones are the gaps. A bare number is a single buzz of that length.
  const buzzMs = (v: number | number[]) =>
    Array.isArray(v)
      ? v.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0)
      : v;

  it("buzzes harder for death than for any other feedback", () => {
    // The previous version of this test asserted only Array.isArray(death),
    // which `[1]` and even `[]` satisfy -- it could not tell a five-pulse
    // death buzz from a silent blip, despite its own name claiming it did.
    const death = buzzMs(vibrationFor({ kind: "death", intensity: 3 }));
    const others = ([1, 2, 3] as const).flatMap((intensity) => [
      buzzMs(vibrationFor({ kind: "damage", intensity })),
      buzzMs(vibrationFor({ kind: "heal", intensity })),
    ]);
    expect(death).toBeGreaterThan(Math.max(...others));
  });

  it("pins the death pattern so a silent one cannot slip through", () => {
    expect(vibrationFor({ kind: "death", intensity: 3 })).toEqual([
      90, 60, 90, 60, 170,
    ]);
  });

  it("discriminates — a single-blip death pattern fails both checks", () => {
    const blip = [1];
    expect(buzzMs(blip)).toBeLessThan(
      buzzMs(vibrationFor({ kind: "damage", intensity: 3 })),
    );
    expect(blip).not.toEqual([90, 60, 90, 60, 170]);
  });

  it("grows with damage intensity", () => {
    const small = vibrationFor({ kind: "damage", intensity: 1 }) as number;
    const big = vibrationFor({ kind: "damage", intensity: 3 }) as number;
    expect(big).toBeGreaterThan(small);
  });

  it("stays silent for a small heal so setup taps do not buzz", () => {
    expect(vibrationFor({ kind: "heal", intensity: 1 })).toBe(0);
  });

  it("buzzes for a large heal", () => {
    expect(vibrationFor({ kind: "heal", intensity: 3 })).toBeGreaterThan(0);
  });
});
