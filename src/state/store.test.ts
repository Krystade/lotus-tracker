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
