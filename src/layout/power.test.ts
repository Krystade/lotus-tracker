import { describe, expect, it } from "vitest";
import { cellInfo, cellJunction, centroid, inscribed, insetCell, polyArea, powerCells, type Pt } from "./power";
import { BUILTIN_TEMPLATES, buildFreeLayout, polyTurnOrder, templateSeats } from "./freeform";

const X = BUILTIN_TEMPLATES.find((t) => t.id === "x")!;
const GRID = BUILTIN_TEMPLATES.find((t) => t.id === "grid")!;
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;
const hasVertex = (poly: Pt[], x: number, y: number, e = 1e-6) => poly.some((p) => near(p.x, x, e) && near(p.y, y, e));

describe("powerCells", () => {
  it("tiles the unit square exactly: areas sum to 1", () => {
    for (const t of [X, GRID]) {
      const cells = powerCells(t.seats);
      expect(cells.every((c) => c.length >= 3)).toBe(true);
      expect(cells.reduce((s, c) => s + polyArea(c), 0)).toBeCloseTo(1, 9);
    }
  });

  it("four equal seats at the edge midpoints meet in an exact X at the centre", () => {
    const cells = powerCells(X.seats);
    for (const c of cells) {
      expect(c).toHaveLength(3);
      expect(hasVertex(c, 0.5, 0.5)).toBe(true);
      expect(polyArea(c)).toBeCloseTo(0.25, 9);
    }
    // The top seat's triangle runs between the two top corners.
    expect(hasVertex(cells[0], 0, 0) && hasVertex(cells[0], 1, 0)).toBe(true);
  });

  it("the Grid template gives four quarters", () => {
    const cells = powerCells(GRID.seats);
    for (const c of cells) expect(polyArea(c)).toBeCloseTo(0.25, 9);
    expect(cells.every((c) => hasVertex(c, 0.5, 0.5))).toBe(true);
  });

  it("a bigger seat claims a bigger cell; uniform scaling changes nothing", () => {
    const a = { x: 0.1, y: 0.4, w: 0.2, h: 0.2 };
    const b = { x: 0.7, y: 0.4, w: 0.1, h: 0.1 };
    const [ca, cb] = powerCells([a, b]);
    expect(polyArea(ca)).toBeGreaterThan(polyArea(cb));
    const k = 0.5;
    const s = (r: typeof a) => ({ x: r.x + (r.w * (1 - k)) / 2, y: r.y + (r.h * (1 - k)) / 2, w: r.w * k, h: r.h * k });
    const [sa] = powerCells([s(a), s(b)]);
    expect(polyArea(sa)).toBeCloseTo(polyArea(ca), 9);
  });

  it("one seat owns the whole board; two seats on one site do not both win", () => {
    expect(polyArea(powerCells([{ x: 0.2, y: 0.2, w: 0.3, h: 0.3 }])[0])).toBeCloseTo(1, 9);
    const same = powerCells([
      { x: 0.4, y: 0.4, w: 0.2, h: 0.2 },
      { x: 0.4, y: 0.4, w: 0.2, h: 0.2 },
    ]);
    expect(same.filter((c) => c.length >= 3)).toHaveLength(1);
  });
});

describe("insetCell", () => {
  it("pulls shared borders in by half the gap and leaves board edges", () => {
    const [left] = powerCells([
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ]);
    const poly = insetCell(left, 400, 800, 8);
    const xs = poly.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(196, 6);
    expect(polyArea(poly)).toBeCloseTo(196 * 800, 3);
  });
});

describe("inscribed", () => {
  it("is the rectangle itself for a rectangle", () => {
    const r = inscribed([
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 70 },
      { x: 10, y: 70 },
    ]);
    expect(r.w * r.h).toBeGreaterThan(100 * 50 * 0.995);
    expect(r.x).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(r.y + r.h).toBeLessThanOrEqual(70 + 1e-6);
  });

  it("fits a right triangle near the known optimum (half of each leg)", () => {
    // Largest axis-aligned rectangle in a right triangle with legs a, b has area ab/4.
    const tri = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 0, y: 100 },
    ];
    const r = inscribed(tri);
    expect(r.w * r.h).toBeGreaterThan(((200 * 100) / 4) * 0.97);
    // Every corner lies inside the triangle: x/200 + y/100 <= 1.
    for (const [x, y] of [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x, r.y + r.h],
      [r.x + r.w, r.y + r.h],
    ])
      expect(x / 200 + y / 100).toBeLessThanOrEqual(1 + 1e-6);
  });

  it("stays inside an X cell on a phone board, and the cell is usable", () => {
    const [top] = powerCells(X.seats);
    const info = cellInfo(top, 363, 760);
    expect(info.ok).toBe(true);
    const r = info.rect;
    // Top triangle, inset 4px: below both diagonals.
    for (const [x, y] of [
      [r.x, r.y + r.h],
      [r.x + r.w, r.y + r.h],
    ]) {
      expect(y).toBeLessThanOrEqual((x / 181.5) * 380 + 1);
      expect(y).toBeLessThanOrEqual(((363 - x) / 181.5) * 380 + 1);
    }
    expect(info.auto).toBe(180); // faces the top edge
  });
});

describe("turn order and hub", () => {
  it("runs clockwise round the cell centroids: X is top, right, bottom, left", () => {
    const layout = buildFreeLayout(templateSeats(X));
    expect(polyTurnOrder(layout.cells!)).toEqual(["p0", "p1", "p2", "p3"]);
  });

  it("does not depend on seat order in the array", () => {
    const layout = buildFreeLayout(templateSeats(GRID));
    // Grid seats: p0 top-left, p1 top-right, p2 bottom-left, p3 bottom-right.
    expect(polyTurnOrder(layout.cells!)).toEqual(["p0", "p1", "p3", "p2"]);
    expect(polyTurnOrder([...layout.cells!].reverse())).toEqual(["p0", "p1", "p3", "p2"]);
  });

  it("puts the hub at the X's centre, and on the border for two seats", () => {
    const x = cellJunction(powerCells(X.seats), 363, 760);
    expect(x.x).toBeCloseTo(0.5, 9);
    expect(x.y).toBeCloseTo(0.5, 9);
    const two = cellJunction(
      powerCells([
        { x: 0.3, y: 0, w: 0.4, h: 0.3 },
        { x: 0.3, y: 0.7, w: 0.4, h: 0.3 },
      ]),
      363,
      760,
    );
    expect(two.y).toBeCloseTo(0.5, 9);
  });

  it("centroid of a triangle is the vertex mean", () => {
    const c = centroid([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 0, y: 3 },
    ]);
    expect(c.x).toBeCloseTo(1, 9);
    expect(c.y).toBeCloseTo(1, 9);
  });
});
