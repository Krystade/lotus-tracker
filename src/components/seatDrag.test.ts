import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../state/store";
import { defaultLayoutFor } from "../layout/presets";
import { seatAt } from "../game/stickers";
import type { LayoutConfig } from "../state/types";
import { clearUndo, faceSeat, undoSeats, useSeatUi } from "./seatDrag";

const s = () => useStore.getState();
const undo = () => useSeatUi.getState().undo;
const rot = (pid: string) => s().game.layout.placements.find((p) => p.playerId === pid)!.rotation;

const column: LayoutConfig = {
  id: "col",
  name: "column",
  builtIn: false,
  playerCount: 4,
  rows: 4,
  cols: 1,
  placements: [0, 1, 2, 3].map((i) => ({ playerId: `p${i}`, row: i + 1, col: 1, rowSpan: 1, colSpan: 1, rotation: 0 })),
};

beforeEach(() => {
  clearUndo();
  s().applyLayout(defaultLayoutFor(4));
  s().newGame({ playerCount: 4, startingLife: 40 });
});

describe("seat undo", () => {
  it("puts back the exact layout and stickers", () => {
    s().giveSticker("monarch", "p0");
    const layout = s().game.layout;
    const stickers = s().game.stickers;
    faceSeat("p0", 180);
    expect(rot("p0")).toBe(180);
    undoSeats();
    expect(s().game.layout).toBe(layout);
    expect(s().game.stickers).toEqual(stickers);
    expect(undo()).toBeNull();
  });

  it("never reaches back into the previous game", () => {
    s().giveSticker("monarch", "p1");
    faceSeat("p0", 180);
    expect(undo()).not.toBeNull();
    // Same pod size: the new game keeps the arrangement as it now stands.
    s().newGame({ playerCount: 4, startingLife: 40 });
    expect(undo()).toBeNull();
    const kept = s().game.layout;
    expect(rot("p0")).toBe(180);
    undoSeats();
    expect(s().game.layout).toBe(kept);
    expect(s().game.stickers).toEqual([]);
  });

  it("retires when the layout is changed some other way", () => {
    faceSeat("p0", 180);
    s().applyLayout(column);
    expect(undo()).toBeNull();
    undoSeats();
    expect(s().game.layout.id).toBe("col");
  });

  it("keeps a sticker that changed hands after the move", () => {
    faceSeat("p0", 180);
    s().giveSticker("monarch", "p2");
    undoSeats();
    expect(rot("p0")).toBe(90);
    expect(s().game.stickers.map((x) => x.holder)).toEqual(["p2"]);
    const m = s().game.stickers[0];
    expect(seatAt(s().game.layout, m.x, m.y)?.playerId).toBe("p2");
  });

  it("offers nothing to undo when the store refused the change", () => {
    faceSeat("p9", 180);
    expect(undo()).toBeNull();
    faceSeat("p0", 90); // already facing that way
    expect(undo()).toBeNull();
  });
});
