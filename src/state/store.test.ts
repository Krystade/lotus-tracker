import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";
import type { LayoutConfig } from "./types";

const s = () => useStore.getState();

const twoPlayerLayout: LayoutConfig = {
  id: "t",
  name: "2p",
  playerCount: 2,
  rows: 2,
  cols: 1,
  builtIn: false,
  placements: [
    { playerId: "p0", row: 1, col: 1, rowSpan: 1, colSpan: 1, rotation: 0 },
    { playerId: "p1", row: 2, col: 1, rowSpan: 1, colSpan: 1, rotation: 0 },
  ],
};

beforeEach(() => {
  s().newGame({ playerCount: 4, startingLife: 40 });
});

describe("layout validation", () => {
  // A layout that does not place every player is what allowed a seat to be
  // starved of turns (and, with a duplicate placement, the turn to lock up).
  // Such a layout must be rejected outright rather than merely tolerated.
  const fourSeats = ["p0", "p1", "p2", "p3"];

  it("rejects a layout that leaves a player unplaced", () => {
    s().applyLayout({
      id: "gap",
      name: "gap",
      playerCount: 4,
      rows: 2,
      cols: 2,
      builtIn: false,
      placements: [
        { playerId: "p0", row: 1, col: 1, rowSpan: 1, colSpan: 1, rotation: 0 },
        { playerId: "p1", row: 1, col: 2, rowSpan: 1, colSpan: 1, rotation: 0 },
        { playerId: "p2", row: 2, col: 1, rowSpan: 1, colSpan: 1, rotation: 0 },
      ],
    });
    const placed = s().game.layout.placements.map((p) => p.playerId).sort();
    expect(placed).toEqual(fourSeats);
  });

  it("rejects a layout that places one seat twice", () => {
    s().applyLayout({
      id: "dup",
      name: "dup",
      playerCount: 4,
      rows: 2,
      cols: 2,
      builtIn: false,
      placements: [
        { playerId: "p0", row: 1, col: 1, rowSpan: 1, colSpan: 1, rotation: 0 },
        { playerId: "p0", row: 1, col: 2, rowSpan: 1, colSpan: 1, rotation: 0 },
        { playerId: "p1", row: 2, col: 1, rowSpan: 1, colSpan: 1, rotation: 0 },
        { playerId: "p2", row: 2, col: 2, rowSpan: 1, colSpan: 1, rotation: 0 },
      ],
    });
    const placed = s().game.layout.placements.map((p) => p.playerId).sort();
    expect(placed).toEqual(fourSeats);
  });

  it("still accepts a valid custom layout", () => {
    s().applyLayout(twoPlayerLayout);
    expect(s().game.layout.id).toBe("t");
  });

  it("every seat gets a turn after a malformed layout is rejected", () => {
    s().applyLayout({
      id: "gap2",
      name: "gap2",
      playerCount: 4,
      rows: 2,
      cols: 2,
      builtIn: false,
      placements: [
        { playerId: "p0", row: 1, col: 1, rowSpan: 1, colSpan: 1, rotation: 0 },
      ],
    });
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      s().passTurn();
      seen.add(s().game.turn.activePlayerId);
    }
    expect([...seen].sort()).toEqual(fourSeats);
  });
});

describe("store correctness", () => {
  it("ignores non-finite setLife but accepts real values", () => {
    s().setLife("p0", NaN);
    expect(s().game.players[0].life).toBe(40);
    s().setLife("p0", 25);
    expect(s().game.players[0].life).toBe(25);
  });

  it("clamps a nonsensical custom starting life", () => {
    s().newGame({ playerCount: 4, startingLife: -3 });
    expect(s().game.startingLife).toBe(1);
    expect(s().game.players[0].life).toBe(1);
  });

  it("hands off the turn when the active player is eliminated", () => {
    expect(s().game.turn.activePlayerId).toBe("p0");
    s().toggleEliminated("p0");
    expect(s().game.players[0].eliminated).toBe(true);
    expect(s().game.turn.activePlayerId).not.toBe("p0");
  });

  it("keeps a custom layout across New Game when the pod size is unchanged", () => {
    s().applyLayout(twoPlayerLayout);
    expect(s().game.layout.id).toBe("t");
    s().newGame({ playerCount: 2, startingLife: 40 });
    expect(s().game.layout.id).toBe("t"); // preserved
    s().newGame({ playerCount: 4, startingLife: 40 });
    expect(s().game.layout.id).not.toBe("t"); // different count -> default
  });

  it("passes the turn clockwise around the pod, not down the array", () => {
    // Default 4-player layout: p0 TL, p1 TR, p2 BL, p3 BR. Going around the
    // table is p0 -> p1 -> p3 -> p2; array order would give p2 third.
    expect(s().game.turn.activePlayerId).toBe("p0");
    s().passTurn();
    expect(s().game.turn.activePlayerId).toBe("p1");
    s().passTurn();
    expect(s().game.turn.activePlayerId).toBe("p3");
    s().passTurn();
    expect(s().game.turn.activePlayerId).toBe("p2");
    s().passTurn();
    expect(s().game.turn.activePlayerId).toBe("p0");
  });

  it("passes clockwise according to a custom layout's geometry", () => {
    // Same four seats, mirrored: p0 TR, p1 TL, p2 BL, p3 BR.
    s().applyLayout({
      id: "mirror",
      name: "mirror",
      playerCount: 4,
      rows: 2,
      cols: 2,
      builtIn: false,
      placements: [
        { playerId: "p0", row: 1, col: 2, rowSpan: 1, colSpan: 1, rotation: 0 },
        { playerId: "p1", row: 1, col: 1, rowSpan: 1, colSpan: 1, rotation: 0 },
        { playerId: "p2", row: 2, col: 1, rowSpan: 1, colSpan: 1, rotation: 0 },
        { playerId: "p3", row: 2, col: 2, rowSpan: 1, colSpan: 1, rotation: 0 },
      ],
    });
    s().setActivePlayer("p0");
    s().passTurn();
    expect(s().game.turn.activePlayerId).toBe("p3"); // TR -> BR, clockwise
  });

  it("does not start the countdown on pass when the turn timer is off", () => {
    s().updateSettings({ turnTimerEnabled: false });
    s().passTurn();
    expect(s().game.turn.running).toBe(false);
  });

  it("prunes stale commander damage when the pod shrinks", () => {
    s().adjustCommanderDamage("p0", "p3", 21); // p0 now lethal from p3
    expect(s().game.players[0].commanderDamage.p3).toBe(21);
    s().applyLayout(twoPlayerLayout);
    expect(s().game.players.length).toBe(2);
    expect(s().game.players[0].commanderDamage.p3).toBeUndefined();
  });
});

describe("player profiles", () => {
  beforeEach(() => {
    s().profiles.forEach((p) => s().deleteProfile(p.id));
  });

  it("saves a profile with a name and a look", () => {
    s().addProfile("Jack", "blue-fade");
    expect(s().profiles).toHaveLength(1);
    expect(s().profiles[0]).toMatchObject({ name: "Jack", look: "blue-fade" });
  });

  it("renames and re-skins a profile", () => {
    s().addProfile("Jack", "blue");
    const id = s().profiles[0].id;
    s().updateProfile(id, { name: "Jackie", look: "red-stripe" });
    expect(s().profiles[0]).toMatchObject({ name: "Jackie", look: "red-stripe" });
  });

  it("deletes a profile", () => {
    s().addProfile("Jack", "blue");
    s().deleteProfile(s().profiles[0].id);
    expect(s().profiles).toHaveLength(0);
  });

  it("ignores a blank profile name", () => {
    s().addProfile("   ", "blue");
    expect(s().profiles).toHaveLength(0);
  });

  it("seats a new game from the chosen profiles, in order", () => {
    s().addProfile("Jack", "blue-fade");
    s().addProfile("Sam", "red-stripe");
    const ids = s().profiles.map((p) => p.id);
    s().newGame({ playerCount: 2, startingLife: 40, profileIds: ids });
    expect(s().game.players.map((p) => p.name)).toEqual(["Jack", "Sam"]);
    expect(s().game.players.map((p) => p.look)).toEqual([
      "blue-fade",
      "red-stripe",
    ]);
  });

  it("sizes the pod to the number of profiles chosen", () => {
    ["A", "B", "C"].forEach((n) => s().addProfile(n, "blue"));
    s().newGame({
      playerCount: 6,
      startingLife: 40,
      profileIds: s().profiles.map((p) => p.id),
    });
    expect(s().game.players).toHaveLength(3);
  });

  it("falls back to default seats when no profiles are chosen", () => {
    s().newGame({ playerCount: 4, startingLife: 40 });
    expect(s().game.players.map((p) => p.name)).toEqual(["P1", "P2", "P3", "P4"]);
    expect(s().game.players[0].look).toBeUndefined();
  });

  it("skips profile ids that no longer exist", () => {
    s().addProfile("Jack", "blue");
    const id = s().profiles[0].id;
    s().newGame({ playerCount: 2, startingLife: 40, profileIds: [id, "gone"] });
    expect(s().game.players.map((p) => p.name)).toEqual(["Jack"]);
  });
});

describe("game setups", () => {
  beforeEach(() => {
    s().setups.forEach((x) => s().deleteSetup(x.id));
  });

  it("saves the current configuration under a name", () => {
    s().newGame({ playerCount: 5, startingLife: 30 });
    s().updateSettings({ defaultTurnBudgetSec: 120, turnTimerEnabled: false });
    s().saveSetup("Two-player night");
    expect(s().setups[0]).toMatchObject({
      name: "Two-player night",
      playerCount: 5,
      startingLife: 30,
      defaultTurnBudgetSec: 120,
      turnTimerEnabled: false,
    });
  });

  it("restores pod size, life and timer when applied", () => {
    s().newGame({ playerCount: 5, startingLife: 30 });
    s().updateSettings({ defaultTurnBudgetSec: 120, turnTimerEnabled: false });
    s().saveSetup("night");
    s().newGame({ playerCount: 4, startingLife: 40 });
    s().updateSettings({ defaultTurnBudgetSec: 300, turnTimerEnabled: true });

    s().applySetup(s().setups[0].id);
    expect(s().game.players).toHaveLength(5);
    expect(s().game.startingLife).toBe(30);
    expect(s().settings.defaultTurnBudgetSec).toBe(120);
    expect(s().settings.turnTimerEnabled).toBe(false);
  });

  it("restores the layout it was saved with", () => {
    s().applyLayout(twoPlayerLayout);
    s().saveSetup("duel");
    s().newGame({ playerCount: 4, startingLife: 40 });
    s().applySetup(s().setups[0].id);
    expect(s().game.layout.playerCount).toBe(2);
  });

  it("ignores a blank setup name", () => {
    s().saveSetup("  ");
    expect(s().setups).toHaveLength(0);
  });

  it("does nothing for a setup that no longer exists", () => {
    const before = s().game.players.length;
    s().applySetup("gone");
    expect(s().game.players).toHaveLength(before);
  });
});

describe("player look", () => {
  it("changes the look of a seat in the current game", () => {
    s().setPlayerLook("p0", "blue-lava");
    expect(s().game.players[0].look).toBe("blue-lava");
  });

  it("leaves other seats alone", () => {
    s().setPlayerLook("p1", "green-tide");
    expect(s().game.players[0].look).toBeUndefined();
    expect(s().game.players[1].look).toBe("green-tide");
  });

  it("ignores an unknown seat", () => {
    s().setPlayerLook("nope", "blue-lava");
    expect(s().game.players.every((p) => p.look === undefined)).toBe(true);
  });

  it("does not touch the saved profile the seat came from", () => {
    s().addProfile("Jack", "gold");
    // Earlier suites leave profiles behind, so find ours rather than assume
    // it is first.
    const mine = s().profiles[s().profiles.length - 1];
    s().newGame({ playerCount: 1, startingLife: 40, profileIds: [mine.id] });
    s().setPlayerLook("p0", "purple-smoke");
    expect(s().game.players[0].look).toBe("purple-smoke");
    expect(s().profiles.find((x) => x.id === mine.id)?.look).toBe("gold");
  });
});
