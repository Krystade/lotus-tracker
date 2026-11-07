import { describe, expect, it } from "vitest";
import { allBuiltInPresets, defaultLayoutFor } from "./presets";
import type { Placement, Rotation } from "../state/types";
import {
  derive,
  gapFree,
  geomKey,
  planMoves,
  pxRects,
  readTable,
  removeSeat,
  splitInto,
  swapSeats,
  tableRing,
  asLayout,
  type Grid,
  type SeatTable,
} from "./table";

const W = 363;
const H = 720;
const GAP = 8;
const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

function* tables(n: number): Generator<SeatTable> {
  const sides = ["top", "right", "bottom", "left"] as const;
  const people = ids(n);
  const assign = (i: number, t: SeatTable): void => {
    if (i === n) {
      gen.push({ top: [...t.top], right: [...t.right], bottom: [...t.bottom], left: [...t.left] });
      return;
    }
    for (const s of sides) {
      for (let k = 0; k <= t[s].length; k++) {
        t[s].splice(k, 0, people[i]);
        assign(i + 1, t);
        t[s].splice(k, 1);
      }
    }
  };
  const gen: SeatTable[] = [];
  assign(0, { top: [], right: [], bottom: [], left: [] });
  yield* gen;
}

describe("seat tables", () => {
  it("every built-in is an exact, faithful table", () => {
    for (const l of allBuiltInPresets()) {
      const r = readTable(l);
      expect(r.exact, l.name).toBe(true);
      if (l.playerCount > 1) expect(r.faithful, l.name).toBe(true);
      expect(geomKey(derive(r.table, Object.fromEntries(l.placements.map((p) => [p.playerId, p.rotation])))))
        .toBe(geomKey(l));
    }
  });

  it("every table up to 4 seats derives gap-free and reads back exact", () => {
    for (let n = 1; n <= 4; n++) {
      for (const t of tables(n)) {
        const g = derive(t);
        expect(gapFree(g)).toBe(true);
        const r = readTable(g);
        expect(r.exact).toBe(true);
        expect(geomKey(derive(r.table))).toBe(geomKey(g));
      }
    }
  });

  it("the ring runs clockwise round the table", () => {
    expect(tableRing({ top: ["a"], right: ["b", "c"], bottom: ["d"], left: ["e", "f"] })).toEqual([
      "a", "b", "c", "d", "f", "e",
    ]);
  });
});

const moveTo = (g: Grid, pid: string, pick: (m: ReturnType<typeof planMoves>["moves"][number]) => boolean) => {
  const plan = planMoves(g, pid, W, H, GAP);
  const m = plan.moves.find(pick);
  if (!m) throw new Error("no such move");
  return m.grid;
};

describe("walkthroughs", () => {
  it("4p 2x2: Ana to the head, then Dee to the foot, gives 1-2-1", () => {
    const four = defaultLayoutFor(4);
    const a = moveTo(four, "p0", (m) => m.kind === "slot" && m.side === "top");
    const ra = pxRects(a, W, H, GAP);
    expect(Math.round(ra.p0.w)).toBe(363);
    expect(a.placements.find((p) => p.playerId === "p0")!.rotation).toBe(180);
    expect(Math.round(ra.p2.h)).toBe(477); // Cal down the whole left
    const b = moveTo(a, "p3", (m) => m.kind === "slot" && m.side === "bottom");
    const rb = pxRects(b, W, H, GAP);
    for (const id of ids(4)) expect(Math.round(rb[id].h)).toBe(235);
    expect(gapFree(b)).toBe(true);
  });

  it("3p: the bottom seat joins the left side, then all three go down one side", () => {
    const three = defaultLayoutFor(3);
    const a = moveTo(three, "p2", (m) => m.kind === "slot" && m.side === "left" && m.index === 1);
    const ra = pxRects(a, W, H, GAP);
    expect(Math.round(ra.p1.h)).toBe(720);
    const b = moveTo(a, "p1", (m) => m.kind === "slot" && m.side === "left" && m.index === 2);
    const rb = pxRects(b, W, H, GAP);
    for (const id of ids(3)) expect(Math.round(rb[id].w)).toBe(363);
  });

  it("6p: one at each end and two down each side", () => {
    const six = defaultLayoutFor(6);
    const a = moveTo(six, "p0", (m) => m.kind === "slot" && m.side === "top");
    const b = moveTo(a, "p5", (m) => m.kind === "slot" && m.side === "bottom");
    const t = readTable(b).table;
    expect(t.top).toEqual(["p0"]);
    expect(t.bottom).toEqual(["p5"]);
    expect(t.left.length).toBe(2);
    expect(t.right.length).toBe(2);
  });

  it("caps each end at two", () => {
    const a = moveTo(defaultLayoutFor(6), "p0", (m) => m.kind === "slot" && m.side === "top");
    const b = moveTo(a, "p1", (m) => m.kind === "slot" && m.side === "top");
    expect(planMoves(b, "p2", W, H, GAP).locked.top).toBe(true);
  });

  it("drops moves that would leave an unreadably small tile", () => {
    for (const m of planMoves(defaultLayoutFor(6), "p0", W, H, GAP).moves) {
      for (const r of Object.values(pxRects(m.grid, W, H, GAP))) expect(Math.min(r.w, r.h)).toBeGreaterThanOrEqual(89.5);
    }
  });

  it("swapping exchanges players and keeps the cells", () => {
    const s = swapSeats(defaultLayoutFor(4), "p0", "p3");
    expect(s.placements[0]).toMatchObject({ playerId: "p3", row: 1, col: 1, rotation: 90 });
  });

  it("names a result that is a preset after the preset", () => {
    expect(asLayout(defaultLayoutFor(4), 4).id).toBe("builtin-4");
    const a = moveTo(defaultLayoutFor(4), "p0", (m) => m.kind === "slot" && m.side === "top");
    expect(asLayout(a, 4).id).toBe("arranged-4");
  });
});

// Customize can build any gap-free grid up to 4x3. Those are edited in place.
const P = (pid: number, row: number, col: number, rowSpan = 1, colSpan = 1, rotation: Rotation = 0): Placement => ({
  playerId: `p${pid}`, row, col, rowSpan, colSpan, rotation,
});

describe("Customize layouts", () => {
  // 3x3 with a centre seat: no seat table can describe it.
  const ring: Grid = {
    rows: 3,
    cols: 3,
    placements: [
      P(0, 1, 1, 1, 3, 180),
      P(1, 2, 1, 1, 1, 90),
      P(2, 2, 2, 1, 1, 0),
      P(3, 2, 3, 1, 1, 270),
      P(4, 3, 1, 1, 3, 0),
    ],
  };

  it("is not read as a table", () => {
    expect(readTable(ring).exact).toBe(false);
  });

  it("a move never re-tidies seats it does not touch", () => {
    const plan = planMoves(ring, "p4", W, H, GAP);
    expect(plan.table).toBe(false);
    expect(plan.moves.length).toBeGreaterThan(0);
    const split = plan.moves.find((m) => m.kind === "split" && m.target === "p2" && m.edge === "bottom")!;
    const before = pxRects(ring, W, H, GAP);
    const after = pxRects(split.grid, W, H, GAP);
    // p0 and the side seats keep their columns and facings.
    for (const id of ["p0", "p1", "p3"]) {
      expect(Math.round(after[id].x)).toBe(Math.round(before[id].x));
      expect(Math.round(after[id].w)).toBe(Math.round(before[id].w));
      const r0 = ring.placements.find((p) => p.playerId === id)!.rotation;
      expect(split.grid.placements.find((p) => p.playerId === id)!.rotation).toBe(r0);
    }
  });

  it("remove/split/strip stay gap-free over every small grid", () => {
    // Every way to paint a 3x2 board with spans: enumerate rectangle tilings.
    const tilings: Grid[] = [];
    const R = 3;
    const C = 2;
    const fill = (cells: number[], placements: Placement[]) => {
      const i = cells.indexOf(-1);
      if (i < 0) {
        tilings.push({ rows: R, cols: C, placements: placements.map((p) => ({ ...p })) });
        return;
      }
      const r0 = Math.floor(i / C);
      const c0 = i % C;
      for (let h = 1; r0 + h <= R; h++) {
        for (let w = 1; c0 + w <= C; w++) {
          let ok = true;
          for (let y = r0; y < r0 + h && ok; y++) for (let x = c0; x < c0 + w; x++) if (cells[y * C + x] !== -1) ok = false;
          if (!ok) continue;
          const next = [...cells];
          for (let y = r0; y < r0 + h; y++) for (let x = c0; x < c0 + w; x++) next[y * C + x] = placements.length;
          fill(next, [...placements, P(placements.length, r0 + 1, c0 + 1, h, w, 90)]);
        }
      }
    };
    fill(new Array(R * C).fill(-1), []);
    expect(tilings.length).toBeGreaterThan(10);
    for (const g of tilings) {
      for (const pid of g.placements.map((p) => p.playerId)) {
        const base = removeSeat(g, pid);
        if (!base) continue;
        expect(gapFree(base)).toBe(true);
        for (const q of base.placements)
          for (const e of ["top", "right", "bottom", "left"] as const) {
            const s = splitInto(base, q.playerId, e, pid, 0);
            expect(s && gapFree(s)).toBe(true);
          }
        for (const m of planMoves(g, pid, W, H, GAP).moves) expect(gapFree(m.grid)).toBe(true);
      }
    }
  });
});
