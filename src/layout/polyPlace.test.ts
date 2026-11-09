import { describe, expect, it } from "vitest";
import { clearSpot, faceFrame } from "./polyPlace";

// A tall triangle-ish cell: wide at the bottom, narrow at the top.
const poly = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 120, y: 300 },
  { x: 0, y: 300 },
];

describe("clearSpot", () => {
  it("keeps the usual spot when it already fits", () => {
    expect(clearSpot(poly, [], 20, 20, { x: 30, y: 250 })).toEqual({ x: 30, y: 250, moved: false });
  });

  it("moves to the nearest spot clear of a block and inside the cell", () => {
    const block = { x: 0, y: 200, w: 60, h: 80 };
    const s = clearSpot(poly, [block], 20, 20, { x: 30, y: 250 })!;
    expect(s.moved).toBe(true);
    const me = { x: s.x - 10, y: s.y - 10, w: 20, h: 20 };
    const hit = me.x < block.x + block.w && me.x + me.w > block.x && me.y < block.y + block.h && me.y + me.h > block.y;
    expect(hit).toBe(false);
    // inside: right edge runs from (40,0) to (120,300)
    expect(me.x + me.w).toBeLessThanOrEqual(40 + (80 * me.y) / 300);
  });

  it("gives up (null) when nothing fits", () => {
    expect(clearSpot(poly, [{ x: -10, y: -10, w: 200, h: 400 }], 20, 20, { x: 30, y: 250 })).toBeNull();
  });
});

describe("faceFrame", () => {
  it("maps a 90° face into its own frame", () => {
    const f = faceFrame({ x: 0, y: 0, w: 100, h: 200 }, 90);
    expect([f.sw, f.sh]).toEqual([200, 100]);
    // rotate(90deg) sends local +x to screen +y: the face's top-left (as read) is the screen's top-right.
    const p = f.toLocal({ x: 100, y: 0 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });
});
