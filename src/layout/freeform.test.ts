import { describe, expect, it } from "vitest";
import { BUILTIN_TEMPLATES, buildFreeLayout, gridApprox, templateSeats } from "./freeform";
import { defaultLayoutFor } from "./presets";

const tpl = (id: string) => buildFreeLayout(templateSeats(BUILTIN_TEMPLATES.find((t) => t.id === id)!));

describe("gridApprox", () => {
  it("turns the X into a seat across the top, two side by side, one across the bottom, each a quarter", () => {
    const x = tpl("x");
    const g = gridApprox(x)!;
    expect([g.rows, g.cols]).toEqual([4, 2]);
    const at = (id: string) => g.placements.find((p) => p.playerId === id)!;
    expect(at("p0")).toMatchObject({ row: 1, col: 1, rowSpan: 1, colSpan: 2 });
    expect(at("p1")).toMatchObject({ row: 2, col: 2, rowSpan: 2, colSpan: 1 });
    expect(at("p2")).toMatchObject({ row: 4, col: 1, rowSpan: 1, colSpan: 2 });
    expect(at("p3")).toMatchObject({ row: 2, col: 1, rowSpan: 2, colSpan: 1 });
    // Facings come from the cells.
    for (const c of x.cells!) expect(at(c.playerId).rotation).toBe(c.rotation);
    expect(g.cells).toBeUndefined();
  });
  it("turns the Grid template into a 2 x 2", () => {
    const g = gridApprox(tpl("grid"))!;
    expect([g.rows, g.cols]).toEqual([2, 2]);
    expect(g.placements.map((p) => [p.row, p.col])).toEqual([[1, 1], [1, 2], [2, 1], [2, 2]]);
  });
  it("is null for a grid layout", () => {
    expect(gridApprox(defaultLayoutFor(4))).toBeNull();
  });
});
