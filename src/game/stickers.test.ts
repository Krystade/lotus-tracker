import { describe, expect, it } from "vitest";
import { tileSpot } from "./stickers";

import { farTopCorner, localSpot, remapStickers } from "./stickers";
import { defaultLayoutFor as presetFor } from "../layout/presets";
describe("remapStickers", () => {
  it("localSpot inverts tileSpot for every facing", () => {
    for (const n of [2, 3, 4, 6]) {
      const l = presetFor(n);
      for (const p of l.placements) {
        const at = tileSpot(l, p.playerId, 0.2, 0.7);
        const back = localSpot(l, p.playerId, at.x, at.y);
        expect(back.lx).toBeCloseTo(0.2);
        expect(back.ly).toBeCloseTo(0.7);
      }
    }
  });
  it("a sticker stays in its holder's corner when the seats change", () => {
    const from = presetFor(4);
    const to = { ...from, placements: from.placements.map((p) => (p.playerId === "p0" ? { ...p, playerId: "p3" } : p.playerId === "p3" ? { ...p, playerId: "p0" } : p)) };
    const at = tileSpot(from, "p0", 0.2, 0.2);
    const [s] = remapStickers([{ id: "monarch", holder: "p0", ...at, scale: 1 }], from, to);
    const want = tileSpot(to, "p0", 0.2, 0.2);
    expect(s.x).toBeCloseTo(want.x);
    expect(s.y).toBeCloseTo(want.y);
  });
});

describe("farTopCorner", () => {
  const P = (id: string, row: number, col: number, rowSpan: number, colSpan: number, rotation: 0 | 90 | 180 | 270) => ({
    playerId: id, row, col, rowSpan, colSpan, rotation,
  });

  it("keeps the handle off a corner timer that sits along the seat's top edge", () => {
    // p3 faces the left edge with the board's middle on its top edge, a third
    // of the way along. The half-disc timer sits to the right of that point,
    // so the handle takes the left corner even though the right one is
    // further from the point itself.
    const layout = {
      rows: 8,
      cols: 2,
      placements: [
        P("p1", 1, 1, 2, 2, 180),
        P("p0", 3, 1, 2, 1, 90),
        P("p2", 5, 1, 2, 1, 90),
        P("p4", 7, 1, 2, 1, 90),
        P("p3", 3, 2, 3, 1, 270),
        P("p5", 6, 2, 3, 1, 270),
      ],
    };
    expect(farTopCorner(layout, "p3")).toBe("left");
  });

  it("otherwise picks the upper corner away from where the seats meet", () => {
    const four = presetFor(4);
    expect(four.placements.map((p) => farTopCorner(four, p.playerId))).toEqual(["left", "right", "right", "left"]);
  });
});
