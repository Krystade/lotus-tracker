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

  it("prunes stale commander damage when the pod shrinks", () => {
    s().adjustCommanderDamage("p0", "p3", 21); // p0 now lethal from p3
    expect(s().game.players[0].commanderDamage.p3).toBe(21);
    s().applyLayout(twoPlayerLayout);
    expect(s().game.players.length).toBe(2);
    expect(s().game.players[0].commanderDamage.p3).toBeUndefined();
  });
});
