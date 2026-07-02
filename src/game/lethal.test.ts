import { describe, expect, it } from "vitest";
import {
  isCommanderDamageLethal,
  isPoisonLethal,
  isPlayerDead,
} from "./lethal";
import type { Player } from "../state/types";

function player(patch: Partial<Player>): Player {
  return {
    id: "p0",
    name: "p0",
    color: "#fff",
    life: 40,
    counters: {
      tax: 0,
      poison: 0,
      energy: 0,
      experience: 0,
      storm: 0,
      charge: 0,
      custom: [],
    },
    commanderDamage: {},
    eliminated: false,
    ...patch,
  };
}

describe("lethal thresholds", () => {
  it("poison is lethal at 10", () => {
    expect(isPoisonLethal(9)).toBe(false);
    expect(isPoisonLethal(10)).toBe(true);
  });

  it("commander damage is lethal at 21 from one source", () => {
    expect(isCommanderDamageLethal({ p1: 20, p2: 15 })).toBe(false);
    expect(isCommanderDamageLethal({ p1: 21 })).toBe(true);
  });

  it("player is dead by life, poison, or commander damage", () => {
    expect(isPlayerDead(player({ life: 0 }))).toBe(true);
    expect(
      isPlayerDead(
        player({ counters: { ...player({}).counters, poison: 10 } }),
      ),
    ).toBe(true);
    expect(isPlayerDead(player({ commanderDamage: { p1: 21 } }))).toBe(true);
    expect(isPlayerDead(player({}))).toBe(false);
  });
});
