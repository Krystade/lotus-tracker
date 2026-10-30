import { describe, expect, it } from "vitest";
import { junctionFor } from "./junction";
import { defaultLayoutFor } from "./presets";

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
