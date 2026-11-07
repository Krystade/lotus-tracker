import { describe, expect, it } from "vitest";
import { boardHub, gapShift, junctionFor } from "./junction";
import { allBuiltInPresets, defaultLayoutFor } from "./presets";
import { derive, pxRects, type SeatTable } from "./table";
import type { LayoutConfig } from "../state/types";

const W = 363;
const H = 720;
const GAP = 8;

const at = (count: number, seat: number) =>
  junctionFor(defaultLayoutFor(count), `p${seat}`);

describe("junctionFor", () => {
  it("4 players: every tile points at the centre, from its own corner", () => {
    expect(at(4, 0)).toMatchObject({ fx: 1, fy: 1, sx: -1, sy: -1, touching: 4, atCenter: true });
    expect(at(4, 1)).toMatchObject({ fx: 0, fy: 1, sx: 1, sy: -1, touching: 4, atCenter: true });
    expect(at(4, 2)).toMatchObject({ fx: 1, fy: 0, sx: -1, sy: 1, touching: 4, atCenter: true });
    expect(at(4, 3)).toMatchObject({ fx: 0, fy: 0, sx: 1, sy: 1, touching: 4, atCenter: true });
  });

  it("3 players: the wide tile uses the middle of its top edge", () => {
    expect(at(3, 2)).toMatchObject({ fx: 0.5, fy: 0, sx: 0, sy: 1, touching: 3, atCenter: true });
    expect(at(3, 0)).toMatchObject({ fx: 1, fy: 1, touching: 3 });
  });

  it("2 players: head to head, middle of the shared edge", () => {
    expect(at(2, 0)).toMatchObject({ fx: 0.5, fy: 1, sx: 0, sy: -1, touching: 2, atCenter: true });
    expect(at(2, 1)).toMatchObject({ fx: 0.5, fy: 0, sx: 0, sy: 1, touching: 2, atCenter: true });
  });

  it("5 players: the four-way corner beats the three-way one, which the bottom seat still gets", () => {
    expect(at(5, 3)).toMatchObject({ fx: 0, fy: 0, touching: 4, atCenter: false });
    expect(at(5, 4)).toMatchObject({ fx: 0.5, fy: 0, touching: 3, atCenter: false });
  });

  it("6 players: middle seats pick one four-way corner, the same every time", () => {
    const a = at(6, 2);
    expect(a).toMatchObject({ touching: 4, fx: 1 });
    expect(at(6, 2)).toEqual(a);
  });

  it("1 player: no neighbours, still somewhere sensible", () => {
    expect(at(1, 0)?.touching).toBe(1);
  });

  it("unknown seat", () => {
    expect(junctionFor(defaultLayoutFor(4), "nope")).toBeNull();
  });
});

type G = Pick<LayoutConfig, "rows" | "cols" | "placements">;

/** Tiles whose closed box holds the point (grid units). */
const touchingAt = (g: G, x: number, y: number) =>
  g.placements.filter(
    (p) => x >= p.col - 1 && x <= p.col - 1 + p.colSpan && y >= p.row - 1 && y <= p.row - 1 + p.rowSpan,
  ).length;

/** The hub back in grid units. */
const hubCellsOf = (g: G) => {
  const h = boardHub(g);
  return { x: h.x * g.cols, y: h.y * g.rows };
};

/** Every seat table of n seats, every order within a side. */
function tables(n: number): SeatTable[] {
  const sides = ["top", "right", "bottom", "left"] as const;
  const out: SeatTable[] = [];
  const t: SeatTable = { top: [], right: [], bottom: [], left: [] };
  const assign = (i: number): void => {
    if (i === n) {
      out.push({ top: [...t.top], right: [...t.right], bottom: [...t.bottom], left: [...t.left] });
      return;
    }
    for (const s of sides) {
      t[s].push(`p${i}`);
      assign(i + 1);
      t[s].pop();
    }
  };
  assign(0);
  return out;
}

// Three seats stacked down the left side: the middle of the board is the
// middle of the second tile -- its life total.
const bench: G = {
  rows: 3,
  cols: 1,
  placements: [
    { playerId: "p0", row: 1, col: 1, rowSpan: 1, colSpan: 1, rotation: 90 },
    { playerId: "p1", row: 2, col: 1, rowSpan: 1, colSpan: 1, rotation: 90 },
    { playerId: "p2", row: 3, col: 1, rowSpan: 1, colSpan: 1, rotation: 90 },
  ],
};

describe("boardHub", () => {
  it("every built-in keeps the exact middle of the board", () => {
    for (const l of allBuiltInPresets()) expect(boardHub(l), l.name).toEqual({ x: 0.5, y: 0.5 });
  });

  it("three down one side: the upper shared edge's middle, not the middle seat's life total", () => {
    expect(boardHub(bench)).toEqual({ x: 0.5, y: 1 / 3 });
    const { x, y } = hubCellsOf(bench);
    expect(touchingAt(bench, x, y)).toBe(2);
  });

  it("ties go to more tiles meeting before the higher point", () => {
    // 2 rows x 4 cols; the middle of the board (2, 1) is inside p1's wide
    // tile. (1, 1) and (3, 1) are equally near; only (3, 1) is three-way.
    const g: G = {
      rows: 2,
      cols: 4,
      placements: [
        { playerId: "p0", row: 1, col: 1, rowSpan: 2, colSpan: 1, rotation: 90 },
        { playerId: "p1", row: 1, col: 2, rowSpan: 2, colSpan: 2, rotation: 0 },
        { playerId: "p2", row: 1, col: 4, rowSpan: 1, colSpan: 1, rotation: 270 },
        { playerId: "p3", row: 2, col: 4, rowSpan: 1, colSpan: 1, rotation: 270 },
      ],
    };
    expect(hubCellsOf(g)).toEqual({ x: 3, y: 1 });
  });

  it("every seat table up to 4 seats: the hub is where 2+ tiles meet", () => {
    let n = 0;
    let moved = 0;
    for (let seats = 1; seats <= 4; seats++) {
      for (const t of tables(seats)) {
        const g = derive(t);
        const { x, y } = hubCellsOf(g);
        const label = JSON.stringify(t);
        // On the half-cell lattice.
        expect(Number.isInteger(x * 2) && Number.isInteger(y * 2), label).toBe(true);
        n++;
        if (seats === 1) {
          expect(boardHub(g), label).toEqual({ x: 0.5, y: 0.5 });
          continue;
        }
        expect(touchingAt(g, x, y), label).toBeGreaterThanOrEqual(2);
        // The middle stays put whenever tiles already meet there.
        if (touchingAt(g, g.cols / 2, g.rows / 2) >= 2) {
          expect(boardHub(g), label).toEqual({ x: 0.5, y: 0.5 });
        } else moved++;
        // Rendered with gaps, the point is within half a gap of every tile
        // that meets there and inside none: the CSS gap shift lands on the
        // border.
        const h = boardHub(g);
        const px = h.x * W + GAP * gapShift(h.x);
        const py = h.y * H + GAP * gapShift(h.y);
        const rects = Object.values(pxRects(g, W, H, GAP));
        const e = 1e-6;
        const near = rects.filter(
          (r) =>
            px >= r.x - GAP / 2 - e && px <= r.x + r.w + GAP / 2 + e &&
            py >= r.y - GAP / 2 - e && py <= r.y + r.h + GAP / 2 + e,
        );
        expect(near.length, label).toBe(touchingAt(g, x, y));
        const inside = rects.filter(
          (r) => px > r.x + e && px < r.x + r.w - e && py > r.y + e && py < r.y + r.h - e,
        );
        expect(inside, label).toEqual([]);
        // Exactly: a line inside the board is its gap's middle, a half cell
        // the middle of its track.
        const at = (u: number, n: number, size: number) => {
          const track = (size - (n - 1) * GAP) / n;
          if (u === 0 || u === n) return u === 0 ? 0 : size;
          return Number.isInteger(u)
            ? u * (track + GAP) - GAP / 2
            : Math.floor(u) * (track + GAP) + track / 2;
        };
        expect(px, label).toBeCloseTo(at(x, g.cols, W), 6);
        expect(py, label).toBeCloseTo(at(y, g.rows, H), 6);
      }
    }
    expect(n).toBe(4 + 16 + 64 + 256);
    // The fuzz really does cover layouts where the middle is on a tile.
    expect(moved).toBeGreaterThan(0);
  });
});

describe("junctionFor at the hub", () => {
  it("built-ins: atCenter is exactly the junctions at the board's middle", () => {
    for (const l of allBuiltInPresets()) {
      for (const p of l.placements) {
        const j = junctionFor(l, p.playerId)!;
        const x = p.col - 1 + j.fx * p.colSpan;
        const y = p.row - 1 + j.fy * p.rowSpan;
        expect(j.atCenter, `${l.name} ${p.playerId}`).toBe(x === l.cols / 2 && y === l.rows / 2);
      }
    }
  });

  it("three down one side: the two seats sharing the hub get the hexagon's clearance", () => {
    expect(junctionFor(bench, "p0")).toMatchObject({ fx: 0.5, fy: 1, touching: 2, atCenter: true });
    expect(junctionFor(bench, "p1")).toMatchObject({ fx: 0.5, fy: 0, touching: 2, atCenter: true });
    expect(junctionFor(bench, "p2")).toMatchObject({ fx: 0.5, fy: 0, touching: 2, atCenter: false });
  });
});
