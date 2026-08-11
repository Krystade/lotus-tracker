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
  it("follows the supplied seating order, not the players array", () => {
    const players = mkPlayers(["p0", "p1", "p2", "p3"]);
    // Clockwise order for a 2x2 pod: array order would answer "p2".
    expect(nextActivePlayerId(players, "p1", ["p0", "p1", "p3", "p2"])).toBe(
      "p3",
    );
  });

  it("wraps around the table", () => {
    const players = mkPlayers(["p0", "p1", "p2"]);
    expect(nextActivePlayerId(players, "p2", ["p0", "p1", "p2"])).toBe("p0");
  });

  it("skips eliminated players", () => {
    const players = mkPlayers(["p0", "p1", "p2"], ["p1"]);
    expect(nextActivePlayerId(players, "p0", ["p0", "p1", "p2"])).toBe("p2");
  });

  it("skips eliminated players in seating order, not array order", () => {
    const players = mkPlayers(["p0", "p1", "p2", "p3"], ["p3"]);
    expect(nextActivePlayerId(players, "p1", ["p0", "p1", "p3", "p2"])).toBe(
      "p2",
    );
  });

  it("stays put if everyone else is out", () => {
    const players = mkPlayers(["p0", "p1"], ["p1"]);
    expect(nextActivePlayerId(players, "p0", ["p0", "p1"])).toBe("p0");
  });

  it("falls back to array order when the order omits the current seat", () => {
    const players = mkPlayers(["p0", "p1"]);
    expect(nextActivePlayerId(players, "p0", [])).toBe("p1");
  });

  it("never starves a player the layout failed to place", () => {
    // A corrupt layout can place fewer seats than there are players (e.g. two
    // placements for one seat leaves another with none). Such a player must
    // still get turns rather than being skipped forever.
    const players = mkPlayers(["p0", "p1", "p2", "p3"]);
    const order = ["p0", "p1", "p2"]; // p3 has no placement
    const seen = new Set<string>();
    let current = "p0";
    for (let i = 0; i < 8; i++) {
      current = nextActivePlayerId(players, current, order);
      seen.add(current);
    }
    expect([...seen].sort()).toEqual(["p0", "p1", "p2", "p3"]);
  });

  it("does not visit a seat twice per lap when a layout duplicates it", () => {
    const players = mkPlayers(["p0", "p1", "p2"]);
    const order = ["p0", "p0", "p1", "p2"]; // p0 placed twice
    const lap = [];
    let current = "p0";
    for (let i = 0; i < 3; i++) {
      current = nextActivePlayerId(players, current, order);
      lap.push(current);
    }
    expect(lap).toEqual(["p1", "p2", "p0"]);
  });
});

describe("advanceTurn", () => {
  const order = ["p0", "p1"];

  it("bumps the turn number and resets the countdown to the budget", () => {
    const players = mkPlayers(["p0", "p1"]);
    const next = advanceTurn(baseTurn, players, 300, order, true);
    expect(next.activePlayerId).toBe("p1");
    expect(next.turnNumber).toBe(2);
    expect(next.remainingSec).toBe(300);
    expect(next.running).toBe(true);
    expect(next.expired).toBe(false);
  });

  it("hands off clockwise rather than by array position", () => {
    const players = mkPlayers(["p0", "p1", "p2", "p3"]);
    const next = advanceTurn(baseTurn, players, 300, [
      "p0",
      "p1",
      "p3",
      "p2",
    ], true);
    expect(next.activePlayerId).toBe("p1");
    const after = advanceTurn(next, players, 300, ["p0", "p1", "p3", "p2"], true);
    expect(after.activePlayerId).toBe("p3");
  });

  it("leaves the countdown paused when the turn timer is disabled", () => {
    const players = mkPlayers(["p0", "p1"]);
    const next = advanceTurn(baseTurn, players, 300, order, false);
    expect(next.running).toBe(false);
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
