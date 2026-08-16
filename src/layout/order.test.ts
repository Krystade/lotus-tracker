import { describe, expect, it } from "vitest";
import { clockwiseSeatOrder, sortBySeatOrder } from "./order";
import { defaultLayoutFor } from "./presets";
import type { LayoutConfig, Placement, Rotation } from "../state/types";

function place(
  seat: number,
  row: number,
  col: number,
  rowSpan = 1,
  colSpan = 1,
): Placement {
  return {
    playerId: `p${seat}`,
    row,
    col,
    rowSpan,
    colSpan,
    rotation: 0 as Rotation,
  };
}

function layout(rows: number, cols: number, placements: Placement[]): LayoutConfig {
  return {
    id: "test",
    name: "test",
    builtIn: false,
    playerCount: placements.length,
    rows,
    cols,
    placements,
  };
}

describe("clockwiseSeatOrder — built-in presets", () => {
  // These expectations are tied to the current grids in presets.ts. If a
  // preset's arrangement changes, the expected order changes with it.
  it.each([
    [1, ["p0"]],
    [2, ["p0", "p1"]],
    [3, ["p0", "p1", "p2"]],
    [4, ["p0", "p1", "p3", "p2"]],
    [5, ["p0", "p1", "p3", "p4", "p2"]],
    [6, ["p0", "p1", "p3", "p5", "p4", "p2"]],
  ])("orders the %i-player preset around the table", (count, expected) => {
    expect(clockwiseSeatOrder(defaultLayoutFor(count as number))).toEqual(
      expected,
    );
  });

  it("does not merely walk the players array (4-player pod)", () => {
    // The bug this exists to prevent: array order gives p0,p1,p2,p3 which cuts
    // back across the table instead of going around it.
    expect(clockwiseSeatOrder(defaultLayoutFor(4))).not.toEqual([
      "p0",
      "p1",
      "p2",
      "p3",
    ]);
  });
});

describe("clockwiseSeatOrder — geometry, not seat count", () => {
  // Three 5-seat layouts, three different correct orders. This is the test
  // that catches anyone reducing the function to a lookup keyed by count.
  it("orders a 2x3 custom layout by its own geometry", () => {
    const l = layout(2, 3, [
      place(0, 1, 1),
      place(1, 1, 2),
      place(2, 1, 3),
      place(3, 2, 1),
      place(4, 2, 3),
    ]);
    expect(clockwiseSeatOrder(l)).toEqual(["p0", "p1", "p2", "p4", "p3"]);
  });

  it("orders a layout with a tall left-edge seat by its own geometry", () => {
    const l = layout(3, 3, [
      place(0, 1, 2),
      place(1, 1, 3),
      place(2, 2, 3),
      place(3, 3, 3),
      place(4, 1, 1, 3, 1),
    ]);
    expect(clockwiseSeatOrder(l)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
  });

  it("gives the same seat count different orders under different grids", () => {
    const a = clockwiseSeatOrder(defaultLayoutFor(5));
    const b = clockwiseSeatOrder(
      layout(2, 3, [
        place(0, 1, 1),
        place(1, 1, 2),
        place(2, 1, 3),
        place(3, 2, 1),
        place(4, 2, 3),
      ]),
    );
    expect(a).not.toEqual(b);
  });
});

describe("clockwiseSeatOrder — degenerate layouts", () => {
  it("returns the only seat for a single tile", () => {
    expect(clockwiseSeatOrder(layout(1, 1, [place(0, 1, 1)]))).toEqual(["p0"]);
  });

  it("falls back to left-to-right for a single row", () => {
    // "Clockwise" is undefined on a line, so reading order is the sane answer.
    const l = layout(1, 4, [
      place(0, 1, 1),
      place(1, 1, 2),
      place(2, 1, 3),
      place(3, 1, 4),
    ]);
    expect(clockwiseSeatOrder(l)).toEqual(["p0", "p1", "p2", "p3"]);
  });

  it("orders a single column top-to-bottom", () => {
    const l = layout(3, 1, [place(0, 1, 1), place(1, 2, 1), place(2, 3, 1)]);
    expect(clockwiseSeatOrder(l)).toEqual(["p0", "p1", "p2"]);
  });

  it("returns every seat exactly once", () => {
    const order = clockwiseSeatOrder(defaultLayoutFor(6));
    expect([...order].sort()).toEqual(["p0", "p1", "p2", "p3", "p4", "p5"]);
  });

  it("breaks ties by seat index rather than placement order", () => {
    // A single column: seats 0 and 1 both sit directly above the centroid and
    // seats 2 and 3 directly below, so each pair shares an angle exactly. The
    // placements are listed scrambled — a stable sort alone would preserve
    // that scramble, so only a real tiebreak produces seat order.
    const l = layout(4, 1, [
      place(3, 4, 1),
      place(1, 2, 1),
      place(2, 3, 1),
      place(0, 1, 1),
    ]);
    expect(clockwiseSeatOrder(l)).toEqual(["p0", "p1", "p2", "p3"]);
  });

  it("returns an empty list for a layout with no placements", () => {
    expect(clockwiseSeatOrder(layout(1, 1, []))).toEqual([]);
  });
});

describe("sortBySeatOrder", () => {
  const seat = (id: string) => ({ id, name: id });

  it("orders items to match the clockwise seat order", () => {
    const order = clockwiseSeatOrder(defaultLayoutFor(4)); // p0,p1,p3,p2
    const sorted = sortBySeatOrder(
      [seat("p0"), seat("p1"), seat("p2"), seat("p3")],
      order,
    );
    expect(sorted.map((s) => s.id)).toEqual(["p0", "p1", "p3", "p2"]);
  });

  it("keeps a subset in seat order", () => {
    // The commander-damage grid lists opponents only.
    const order = clockwiseSeatOrder(defaultLayoutFor(4));
    const sorted = sortBySeatOrder([seat("p2"), seat("p3"), seat("p1")], order);
    expect(sorted.map((s) => s.id)).toEqual(["p1", "p3", "p2"]);
  });

  it("puts anything the layout does not place at the end", () => {
    const sorted = sortBySeatOrder(
      [seat("pX"), seat("p1"), seat("p0")],
      ["p0", "p1"],
    );
    expect(sorted.map((s) => s.id)).toEqual(["p0", "p1", "pX"]);
  });

  it("leaves the input order alone when there is no seat order", () => {
    const sorted = sortBySeatOrder([seat("p1"), seat("p0")], []);
    expect(sorted.map((s) => s.id)).toEqual(["p1", "p0"]);
  });

  it("does not mutate the array it is given", () => {
    const input = [seat("p2"), seat("p0")];
    sortBySeatOrder(input, ["p0", "p2"]);
    expect(input.map((s) => s.id)).toEqual(["p2", "p0"]);
  });
});
