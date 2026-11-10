import { describe, expect, it } from "vitest";
import { tileSpot } from "./stickers";

import { farTopCorner, giveSticker, localSpot, placeSticker, remapStickers, seatAt, seatHandleSpot, startSpot } from "./stickers";
import { BUILTIN_TEMPLATES, buildFreeLayout, templateSeats } from "../layout/freeform";
import { defaultLayoutFor as presetFor } from "../layout/presets";
import { HUB_REACH } from "../layout/junction";
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

describe("seatHandleSpot", () => {
  const P = (id: string, row: number, col: number, rowSpan: number, colSpan: number, rotation: 0 | 90 | 180 | 270) => ({
    playerId: id, row, col, rowSpan, colSpan, rotation,
  });
  // 6p 4x2: two at the head, one down the left, three down the right. Ben
  // (p1) has the four-way corner -- the timer -- at one top corner and the
  // board's hub, under the menu hexagon, at the other.
  const sixHub = {
    rows: 4,
    cols: 2,
    placements: [
      P("p2", 1, 1, 1, 1, 180),
      P("p0", 1, 2, 1, 1, 180),
      P("p4", 2, 1, 3, 1, 90),
      P("p1", 2, 2, 1, 1, 270),
      P("p3", 3, 2, 1, 1, 270),
      P("p5", 4, 2, 1, 1, 270),
    ],
  };

  it("slides the handle along the top edge, past the hexagon, when both corners are taken", () => {
    // Ben faces the left edge: his top edge runs up the board, so the
    // hexagon (above the hub) is what the handle must clear.
    expect(seatHandleSpot(sixHub, "p1")).toEqual({ side: "left", push: { px: HUB_REACH.up, behind: 0 } });
    // Mirrored top to bottom: the hub is on Ben's other corner, and the
    // clock (below it) is in the way.
    const flipped = {
      ...sixHub,
      placements: sixHub.placements.map((p) => ({ ...p, row: 6 - p.row - p.rowSpan, rotation: (p.rotation === 180 ? 0 : p.rotation) as 0 | 90 | 180 | 270 })),
    };
    const ben = flipped.placements.find((p) => p.playerId === "p1")!;
    expect(ben.row).toBe(3);
    expect(seatHandleSpot(flipped, "p1")).toEqual({ side: "right", push: { px: HUB_REACH.down, behind: 0 } });
  });

  it("caps the handle's size where the hub is partway along its top edge", () => {
    // Five seats down the left, one down the right: the hub is the middle of
    // Cal's top edge, the timer has one corner and the handle the other.
    const fiveTwo = {
      rows: 5,
      cols: 2,
      placements: [0, 1, 2, 3, 4].map((i) => P(`p${i}`, i + 1, 1, 1, 1, 90)).concat([P("p5", 1, 2, 5, 1, 270)]),
    };
    expect(seatHandleSpot(fiveTwo, "p2")).toEqual({ side: "right", room: { px: HUB_REACH.down + 5, ahead: 0.5 } });
  });

  it("starts a sticker below a handle slid along the edge, not on it", () => {
    const [s] = giveSticker([], sixHub, "monarch", "p1");
    expect(localSpot(sixHub, "p1", s.x, s.y).lx).toBeCloseTo(0.3);
    expect(localSpot(sixHub, "p1", s.x, s.y).ly).toBeCloseTo(0.45);
    const four = presetFor(4);
    const [t] = giveSticker([], four, "monarch", "p0");
    expect(localSpot(four, "p0", t.x, t.y).ly).toBeCloseTo(0.3);
  });

  it("leaves every preset's handle in its corner", () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const l = presetFor(n);
      for (const p of l.placements) {
        const s = seatHandleSpot(l, p.playerId);
        expect(s.side).toBe(farTopCorner(l, p.playerId));
        expect(s.push).toBeUndefined();
      }
    }
    expect(seatHandleSpot(sixHub, "p3").push).toBeUndefined();
  });
});

describe("freeform stickers", () => {
  const x = buildFreeLayout(templateSeats(BUILTIN_TEMPLATES.find((t) => t.id === "x")!));
  it("seatAt asks the cells, not the grid stand-ins", () => {
    // The X's top cell runs down to the middle; its stand-in only covers its face up top.
    expect(seatAt(x, 0.5, 0.4)?.playerId).toBe("p0");
    expect(seatAt({ ...x, cells: undefined }, 0.5, 0.4)).toBeNull();
    expect(seatAt(x, 0.9, 0.5)?.playerId).toBe("p1");
    expect(seatAt(x, 0.5, 0.95)?.playerId).toBe("p2");
    expect(seatAt(x, 0.05, 0.5)?.playerId).toBe("p3");
  });
  it("a dropped sticker goes to the cell it lands in", () => {
    const [s] = placeSticker(giveSticker([], x, "monarch", "p1"), x, "monarch", { x: 0.5, y: 0.4, scale: 1 });
    expect(s.holder).toBe("p0");
  });
  it("giveSticker takes a measured start spot, else startSpot", () => {
    expect(giveSticker([], x, "ring", "p2", { x: 0.4, y: 0.7 })[0]).toMatchObject({ x: 0.4, y: 0.7, holder: "p2" });
    const [t] = giveSticker([], x, "ring", "p2", null);
    expect({ x: t.x, y: t.y }).toEqual(startSpot(x, "p2"));
  });
});
