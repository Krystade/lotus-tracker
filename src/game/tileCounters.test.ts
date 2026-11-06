import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../state/store";
import { tileCounters } from "./tileCounters";
import { placeSticker, seatAt } from "./stickers";
import { defaultLayoutFor } from "../layout/presets";

const s = () => useStore.getState();
const shown = (pid = "p0") => {
  const ps = s().game.players;
  return tileCounters(ps.find((p) => p.id === pid)!, ps).map((c) => [c.key, c.value]);
};

beforeEach(() => s().newGame({ playerCount: 4, startingLife: 40 }));

describe("counters on the tile", () => {
  it("a fresh tile shows none", () => {
    expect(shown()).toEqual([]);
  });

  it("anything used stays on the tile, even back at 0", () => {
    s().adjustCounter("p0", "poison", 1);
    s().adjustCounter("p0", "poison", -1);
    s().bumpTax("p0", 1);
    expect(shown()).toEqual([["tax", 2], ["poison", 0]]);
  });

  it("commander damage is per opponent, first, and pins too", () => {
    s().adjustCommanderDamage("p0", "p2", 3);
    s().adjustCommanderDamage("p0", "p1", 1);
    s().adjustCommanderDamage("p0", "p1", -1);
    s().adjustCounter("p0", "energy", 2);
    expect(shown()).toEqual([["cmdr:p1", 0], ["cmdr:p2", 3], ["energy", 2]]);
  });

  it("a custom counter shows as soon as it is added; removing it takes it off", () => {
    s().addCustomCounter("p0", "Rad");
    const id = s().game.players[0].counters.custom[0].id;
    expect(shown()).toEqual([[`custom:${id}`, 0]]);
    s().removeCustomCounter("p0", id);
    expect(shown()).toEqual([]);
  });

  it("hiding at 0 takes it off until it is used again; a value above 0 always shows", () => {
    s().adjustCounter("p0", "storm", 1);
    s().unpinCounter("p0", "storm");
    expect(shown()).toEqual([["storm", 1]]);
    s().adjustCounter("p0", "storm", -1);
    s().unpinCounter("p0", "storm");
    expect(shown()).toEqual([]);
  });

  it("reset life clears them", () => {
    s().adjustCounter("p0", "poison", 0);
    s().resetLife();
    expect(shown()).toEqual([]);
  });

  it("marks lethal poison and commander damage", () => {
    s().adjustCounter("p1", "poison", 10);
    s().adjustCommanderDamage("p1", "p0", 21);
    const ps = s().game.players;
    expect(tileCounters(ps[1], ps).every((c) => c.warn)).toBe(true);
  });
});

describe("stickers on the board", () => {
  const four = defaultLayoutFor(4);

  it("start on the seat they're given to, in that player's upper-left, off the life total", () => {
    for (const seat of ["p0", "p1", "p2", "p3"]) {
      s().giveSticker("monarch", seat);
      const st = s().game.stickers[0];
      expect(seatAt(four, st.x, st.y)?.playerId).toBe(seat);
      const c = { p0: [0.25, 0.25], p1: [0.75, 0.25], p2: [0.25, 0.75], p3: [0.75, 0.75] }[seat]!;
      expect(Math.hypot(st.x - c[0], st.y - c[1])).toBeGreaterThan(0.1);
    }
    // Seat 0 faces right (rotated 90): its upper-left is the screen's top-right of the tile.
    s().giveSticker("ring", "p0");
    const r = s().game.stickers.find((x) => x.id === "ring")!;
    expect(r.x).toBeGreaterThan(0.25);
    expect(r.y).toBeLessThan(0.25);
  });

  it("belong to whoever's tile they're dropped on, and keep their holder over a gap", () => {
    s().giveSticker("monarch", "p0");
    s().placeSticker("monarch", { x: 0.8, y: 0.2, scale: 2 });
    expect(s().game.stickers[0]).toMatchObject({ holder: "p1", scale: 2 });
    expect(seatAt(four, 0.8, 0.2)?.playerId).toBe("p1");
    // Off the edge of a custom layout with an empty cell: no seat there.
    const holey = { ...four, placements: four.placements.filter((p) => p.playerId !== "p3") };
    const out = placeSticker([{ id: "ring", holder: "p0", x: 0.2, y: 0.2, scale: 1 }], holey, "ring", { x: 0.8, y: 0.8, scale: 1 });
    expect(out[0].holder).toBe("p0");
  });

  it("clamp position and size", () => {
    s().giveSticker("ring", "p0");
    s().placeSticker("ring", { x: 5, y: -1, scale: 99 });
    expect(s().game.stickers[0]).toMatchObject({ x: 1, y: 0, scale: 4 });
  });

  it("a move within the same tile is not a log entry; a move to another seat is", () => {
    s().giveSticker("monarch", "p0");
    const before = s().game.log.length;
    s().placeSticker("monarch", { x: 0.1, y: 0.1, scale: 1.5 });
    expect(s().game.log.length).toBe(before);
    s().placeSticker("monarch", { x: 0.9, y: 0.9, scale: 1.5 });
    expect(s().game.log.slice(-1)[0]).toMatchObject({ kind: "sticker", playerId: "p3", from: "p0" });
  });
});
