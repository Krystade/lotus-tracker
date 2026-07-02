import { describe, expect, it } from "vitest";
import { advanceTurn, nextActivePlayerId, tickTurn } from "./turn";
import type { Player, TurnState } from "../state/types";

function mkPlayers(ids: string[], eliminated: string[] = []): Player[] {
  return ids.map((id) => ({
    id,
    name: id,
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
    eliminated: eliminated.includes(id),
  }));
}

const baseTurn: TurnState = {
  activePlayerId: "p0",
  turnNumber: 1,
  budgetSec: 300,
  remainingSec: 120,
  running: true,
  expired: false,
};

describe("nextActivePlayerId", () => {
  it("wraps around the table", () => {
    const players = mkPlayers(["p0", "p1", "p2"]);
    expect(nextActivePlayerId(players, "p2")).toBe("p0");
  });

  it("skips eliminated players", () => {
    const players = mkPlayers(["p0", "p1", "p2"], ["p1"]);
    expect(nextActivePlayerId(players, "p0")).toBe("p2");
  });

  it("stays put if everyone else is out", () => {
    const players = mkPlayers(["p0", "p1"], ["p1"]);
    expect(nextActivePlayerId(players, "p0")).toBe("p0");
  });
});

describe("advanceTurn", () => {
  it("bumps the turn number and resets the countdown to the budget", () => {
    const players = mkPlayers(["p0", "p1"]);
    const next = advanceTurn(baseTurn, players, 300);
    expect(next.activePlayerId).toBe("p1");
    expect(next.turnNumber).toBe(2);
    expect(next.remainingSec).toBe(300);
    expect(next.running).toBe(true);
    expect(next.expired).toBe(false);
  });
});

describe("tickTurn", () => {
  it("counts down while running", () => {
    expect(tickTurn(baseTurn, 5).remainingSec).toBe(115);
  });

  it("stops and flags expiry at zero, no negative", () => {
    const t = tickTurn({ ...baseTurn, remainingSec: 3 }, 5);
    expect(t.remainingSec).toBe(0);
    expect(t.expired).toBe(true);
    expect(t.running).toBe(false);
  });

  it("does nothing when paused", () => {
    const paused = { ...baseTurn, running: false };
    expect(tickTurn(paused, 5)).toEqual(paused);
  });
});
