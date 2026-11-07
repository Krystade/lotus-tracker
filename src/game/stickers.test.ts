import { describe, expect, it } from "vitest";
import { tileSpot } from "./stickers";

import { localSpot, remapStickers } from "./stickers";
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
