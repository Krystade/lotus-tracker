import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../state/store";
import { MERGE_MS } from "./log";

const s = () => useStore.getState();
const log = () => s().game.log;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  s().newGame({ playerCount: 4, startingLife: 40 });
});
afterEach(() => vi.useRealTimers());

describe("game log", () => {
  it("starts empty and records a life change with the total after it", () => {
    expect(log()).toEqual([]);
    s().adjustLife("p1", -3);
    expect(log()).toMatchObject([{ kind: "life", playerId: "p1", delta: -3, value: 37, turn: 1 }]);
  });

  it("folds rapid taps into one entry, and splits once the pause is long enough", () => {
    for (let i = 0; i < 10; i++) s().adjustLife("p0", -1);
    expect(log()).toHaveLength(1);
    expect(log()[0]).toMatchObject({ delta: -10, value: 30 });
    vi.advanceTimersByTime(MERGE_MS + 1);
    s().adjustLife("p0", -1);
    expect(log()).toHaveLength(2);
  });

  it("drops a mis-tap that was taken straight back", () => {
    s().adjustLife("p0", -1);
    s().adjustLife("p0", 1);
    expect(log()).toEqual([]);
  });

  it("tells commander damage as one hit, not a hit plus a life loss", () => {
    s().adjustCommanderDamage("p2", "p0", 6);
    expect(log()).toEqual([
      expect.objectContaining({ kind: "cmdr", playerId: "p2", from: "p0", delta: 6, value: 6 }),
    ]);
    expect(s().game.players[2].life).toBe(34);
  });

  it("records poison and who a sticker went to", () => {
    s().adjustCounter("p3", "poison", 2);
    s().giveSticker("monarch", "p1");
    s().giveSticker("monarch", "p2");
    expect(log().map((e) => [e.kind, e.playerId, e.from])).toEqual([
      ["poison", "p3", undefined],
      ["sticker", "p1", undefined],
      ["sticker", "p2", "p1"],
    ]);
  });

  it("is not touched by things that are not changes to the game's story", () => {
    s().adjustLife("p0", -2);
    const before = log();
    s().tick(1);
    s().passTurn();
    s().setPlayerName("p0", "Jack");
    expect(log()).toBe(before);
  });

  it("is cleared by reset life and by a new game", () => {
    s().adjustLife("p0", -2);
    s().giveSticker("monarch", "p0");
    s().resetLife();
    expect(log()).toEqual([]);
    expect(s().game.stickers).toEqual([]);
    s().adjustLife("p0", -2);
    s().newGame({ playerCount: 4, startingLife: 40 });
    expect(log()).toEqual([]);
  });
});

describe("stickers", () => {
  it("one holder at a time: giving it moves it", () => {
    s().giveSticker("monarch", "p0");
    s().giveSticker("initiative", "p0");
    s().giveSticker("monarch", "p3");
    expect(s().game.stickers).toEqual([
      { id: "initiative", holder: "p0" },
      { id: "monarch", holder: "p3" },
    ]);
    s().giveSticker("monarch", null);
    expect(s().game.stickers).toEqual([{ id: "initiative", holder: "p0" }]);
  });

  it("leaves the table with a seat that is removed", () => {
    s().giveSticker("monarch", "p3");
    s().newGame({ playerCount: 4, startingLife: 40 });
    s().giveSticker("ring", "p3");
    s().applyLayout({
      id: "x",
      name: "2p",
      playerCount: 2,
      rows: 2,
      cols: 1,
      builtIn: false,
      placements: [
        { playerId: "p0", row: 1, col: 1, rowSpan: 1, colSpan: 1, rotation: 180 },
        { playerId: "p1", row: 2, col: 1, rowSpan: 1, colSpan: 1, rotation: 0 },
      ],
    });
    expect(s().game.stickers).toEqual([]);
  });
});

describe("saved groups", () => {
  it("a saved setup puts everyone back in their seat with their look", () => {
    s().setPlayerName("p0", "Jack");
    s().setPlayerName("p2", "Sam");
    s().setPlayerLook("p2", "aurora");
    s().saveSetup("Friday");
    s().newGame({ playerCount: 4, startingLife: 40 });
    expect(s().game.players[0].name).not.toBe("Jack");
    s().applySetup(s().setups.slice(-1)[0].id);
    const ps = s().game.players;
    expect([ps[0].name, ps[2].name, ps[2].look]).toEqual(["Jack", "Sam", "aurora"]);
  });

  it("an older setup without players still loads", () => {
    s().saveSetup("Old");
    const old = s().setups.slice(-1)[0];
    useStore.setState({ setups: [{ ...old, players: undefined }] });
    expect(() => s().applySetup(old.id)).not.toThrow();
    expect(s().game.players).toHaveLength(4);
  });
});
