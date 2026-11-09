import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";
import { BUILTIN_TEMPLATES, buildFreeLayout, sanitizeFreeform, sanitizeTemplates, templateSeats } from "../layout/freeform";
import { clockwiseSeatOrder } from "../layout/order";
import { boardHub, junctionFor } from "../layout/junction";
import { defaultLayoutFor } from "../layout/presets";

const s = () => useStore.getState();
const X = BUILTIN_TEMPLATES.find((t) => t.id === "x")!;
const GRID = BUILTIN_TEMPLATES.find((t) => t.id === "grid")!;

/** What an older build (before freeform existed) wrote to storage. */
function oldSave() {
  const players = Array.from({ length: 4 }, (_, i) => ({
    id: `p${i}`,
    name: `P${i + 1}`,
    color: "#e4b33d",
    life: 33 + i,
    counters: { tax: 0, poison: 0, energy: 0, experience: 0, storm: 0, charge: 0, custom: [] },
    commanderDamage: {},
    eliminated: false,
  }));
  return {
    state: {
      game: {
        players,
        startingLife: 40,
        layout: { ...defaultLayoutFor(4) },
        turn: { activePlayerId: "p2", turnNumber: 3, budgetSec: 300, remainingSec: 120, running: true, expired: false },
        gameElapsedSec: 10,
        gameTimerRunning: true,
        stickers: [],
        log: [],
      },
      settings: {},
      customLayouts: [{ ...defaultLayoutFor(3), id: "custom-a", name: "Mine", builtIn: false }],
      profiles: [],
      setups: [],
    },
    version: 2,
  };
}

async function rehydrate(blob: unknown) {
  localStorage.setItem("lotus-tracker", JSON.stringify(blob));
  await useStore.persist.rehydrate();
}

beforeEach(() => {
  localStorage.clear();
  s().newGame({ playerCount: 4, startingLife: 40 });
});

describe("persistence across versions", () => {
  it("loads a save from before freeform: grid layout, no templates, game intact", async () => {
    await rehydrate(oldSave());
    expect(s().game.layout.cells).toBeUndefined();
    expect(s().game.layout.placements).toHaveLength(4);
    expect(s().freeTemplates).toEqual([]);
    expect(s().game.players.map((p) => p.life)).toEqual([33, 34, 35, 36]);
    expect(s().game.turn.activePlayerId).toBe("p2");
    expect(s().customLayouts).toHaveLength(1);
  });

  it("keeps a sound freeform layout and its templates", async () => {
    const blob = oldSave();
    (blob.state.game as Record<string, unknown>).layout = buildFreeLayout(templateSeats(X));
    (blob.state as Record<string, unknown>).freeTemplates = [{ id: "ft-1", name: "4P · #1", seats: X.seats }];
    await rehydrate(blob);
    expect(s().game.layout.cells).toHaveLength(4);
    expect(s().game.layout.seats).toHaveLength(4);
    expect(s().freeTemplates).toHaveLength(1);
  });

  it("drops damaged cells but keeps the layout's grid placements", async () => {
    const blob = oldSave();
    const layout = buildFreeLayout(templateSeats(X));
    (layout.cells as unknown[])[1] = { playerId: "p1", poly: "nope", rotation: 90 };
    (blob.state.game as Record<string, unknown>).layout = layout;
    (blob.state as Record<string, unknown>).freeTemplates = "corrupt";
    await rehydrate(blob);
    expect(s().game.layout.cells).toBeUndefined();
    expect(s().game.layout.seats).toBeUndefined();
    expect(s().game.layout.placements).toHaveLength(4);
    expect(s().freeTemplates).toEqual([]);
  });

  it("sanitizeFreeform leaves grid layouts alone and strips only bad seats", () => {
    const grid = defaultLayoutFor(4);
    expect(sanitizeFreeform(grid)).toBe(grid);
    const free = buildFreeLayout(templateSeats(GRID));
    expect(sanitizeFreeform(free)).toBe(free);
    const badSeats = { ...free, seats: [{ playerId: "p0", x: 0, y: 0, w: -1, h: 1, rot: null }] };
    const out = sanitizeFreeform(badSeats as typeof free);
    expect(out.cells).toHaveLength(4);
    expect(out.seats).toBeUndefined();
  });

  it("sanitizeTemplates drops malformed entries", () => {
    const ok = { id: "a", name: "A", seats: X.seats };
    expect(sanitizeTemplates([ok, null, { id: 3 }, { id: "b", seats: [{ x: "1" }] }, { id: "c", seats: [] }])).toEqual([ok]);
  });
});

describe("freeform layouts in the game", () => {
  it("built layouts place every seat, on a valid grid of stand-ins", () => {
    const l = buildFreeLayout(templateSeats(X));
    expect(l.placements.map((p) => p.playerId)).toEqual(["p0", "p1", "p2", "p3"]);
    for (const p of l.placements) {
      expect(p.rowSpan).toBeGreaterThan(0);
      expect(p.colSpan).toBeGreaterThan(0);
      expect(p.row + p.rowSpan - 1).toBeLessThanOrEqual(l.rows);
      expect(p.col + p.colSpan - 1).toBeLessThanOrEqual(l.cols);
      expect(p.rotation).toBe(l.cells!.find((c) => c.playerId === p.playerId)!.rotation);
    }
    // Each faces its own edge: top seat turned to the top, and so on.
    expect(l.cells!.map((c) => c.rotation)).toEqual([180, 270, 0, 90]);
  });

  it("turn order, hub and corner timer follow the cells", () => {
    const l = buildFreeLayout(templateSeats(X));
    expect(clockwiseSeatOrder(l)).toEqual(["p0", "p1", "p2", "p3"]);
    const hub = boardHub(l);
    expect(hub.x).toBeCloseTo(0.5, 6);
    expect(hub.y).toBeCloseTo(0.5, 6);
    expect(junctionFor(l, "p0")).toBeNull();
  });

  it("passTurn walks the cells clockwise", () => {
    s().applyLayout(buildFreeLayout(templateSeats(GRID)));
    s().setActivePlayer("p0");
    const seen = ["p0"];
    for (let i = 0; i < 3; i++) {
      s().passTurn();
      seen.push(s().game.turn.activePlayerId);
    }
    expect(seen).toEqual(["p0", "p1", "p3", "p2"]);
  });

  it("applyFreeform keeps each player's life and remaps ids when a seat is removed", () => {
    s().adjustLife("p1", -5);
    s().adjustLife("p3", -7);
    s().setActivePlayer("p3");
    const seats = templateSeats(X).slice(0, 3);
    // Seat order: p0, p3, p2 survive; p1 is removed; one new player.
    const layout = buildFreeLayout([...seats, { ...seats[0], x: 0.3, y: 0.4, playerId: "x" }]);
    s().applyFreeform(layout, ["p0", "p3", "p2", null]);
    const g = s().game;
    expect(g.players.map((p) => p.id)).toEqual(["p0", "p1", "p2", "p3"]);
    expect(g.players[1].life).toBe(33); // the old p3
    expect(g.players[1].name).toBe("P4");
    expect(g.players[3].life).toBe(40); // new
    expect(new Set(g.players.map((p) => p.color)).size).toBe(4);
    expect(new Set(g.players.map((p) => p.name)).size).toBe(4);
    expect(g.turn.activePlayerId).toBe("p1");
    expect(g.layout.cells).toHaveLength(4);
  });

  it("applyFreeform refuses a layout that does not cover the seats", () => {
    const before = s().game;
    s().applyFreeform(buildFreeLayout(templateSeats(X)), ["p0", "p1"]);
    expect(s().game).toBe(before);
  });

  it("saveFreeTemplate saves once and spots built-ins", () => {
    const n0 = s().freeTemplates.length;
    expect(s().saveFreeTemplate(templateSeats(X))).toEqual({ name: "X", fresh: false });
    const seats = templateSeats(GRID).map((q) => ({ ...q, w: q.w * 0.9 }));
    const first = s().saveFreeTemplate(seats);
    expect(first.fresh).toBe(true);
    expect(s().saveFreeTemplate(seats)).toEqual({ name: first.name, fresh: false });
    expect(s().freeTemplates).toHaveLength(n0 + 1);
  });

  it("setSeatRotation keeps a cell's rotation in step", () => {
    s().applyLayout(buildFreeLayout(templateSeats(X)));
    s().setSeatRotation("p0", 0);
    expect(s().game.layout.cells![0].rotation).toBe(0);
    expect(s().game.layout.placements[0].rotation).toBe(0);
  });
});
