import { describe, expect, it } from "vitest";
import { defaultLayoutFor } from "./presets";
import { planMoves, pxRects, type Grid } from "./table";
import { pickTarget, type PickInput, type SeatTarget } from "./seatTarget";

const W = 363;
const H = 720;
const GAP = 8;

function at(g: Grid, pid: string, arm: [number, number], x: number, y: number, extra: Partial<PickInput> = {}): SeatTarget {
  return pickTarget({
    pid,
    x,
    y,
    armX: arm[0],
    armY: arm[1],
    departed: true,
    leftArmZone: false,
    W,
    H,
    gap: GAP,
    rects: pxRects(g, W, H, GAP),
    plan: planMoves(g, pid, W, H, GAP),
    current: { kind: "none" },
    ...extra,
  });
}

describe("pickTarget", () => {
  const four = defaultLayoutFor(4);

  it("does nothing until the finger departs", () => {
    expect(at(four, "p0", [150, 30], 160, 40, { departed: false }).kind).toBe("none");
  });

  it("a handle armed in the head zone must push on to the edge", () => {
    expect(at(four, "p0", [150, 30], 150, 40).kind).not.toBe("move");
    const t = at(four, "p0", [150, 30], 150, 2);
    expect(t.kind === "move" && t.move.kind === "slot" && t.move.side).toBe("top");
  });

  it("past the top of the screen still counts as the head", () => {
    const t = at(four, "p2", [150, 650], 150, -30);
    expect(t.kind === "move" && t.move.kind === "slot" && t.move.side).toBe("top");
  });

  it("the centre disc swaps", () => {
    const r = pxRects(four, W, H, GAP).p3;
    expect(at(four, "p0", [150, 30], r.x + r.w / 2 + 10, r.y + r.h / 2)).toEqual({ kind: "swap", with: "p3" });
  });

  it("own centre is home", () => {
    const r = pxRects(four, W, H, GAP).p0;
    expect(at(four, "p0", [150, 30], r.x + r.w / 2, r.y + r.h / 2).kind).toBe("home");
  });

  it("3p: the bottom seat dragged into the lower-left joins the left side", () => {
    const three = defaultLayoutFor(3);
    const t = at(three, "p2", [28, 392], 90, 506);
    expect(t.kind).toBe("move");
    if (t.kind === "move" && t.move.kind === "slot") {
      expect(t.move.side).toBe("left");
      expect(t.move.index).toBe(1);
    }
  });

  it("Customize layouts split the tile under the finger on its nearest edge", () => {
    const g: Grid = {
      rows: 3,
      cols: 3,
      placements: [
        { playerId: "p0", row: 1, col: 1, rowSpan: 1, colSpan: 3, rotation: 180 },
        { playerId: "p1", row: 2, col: 1, rowSpan: 1, colSpan: 1, rotation: 90 },
        { playerId: "p2", row: 2, col: 2, rowSpan: 1, colSpan: 1, rotation: 0 },
        { playerId: "p3", row: 2, col: 3, rowSpan: 1, colSpan: 1, rotation: 270 },
        { playerId: "p4", row: 3, col: 1, rowSpan: 1, colSpan: 3, rotation: 0 },
      ],
    };
    const r = pxRects(g, W, H, GAP).p0;
    const t = at(g, "p4", [20, 700], r.x + r.w * 0.85, r.y + r.h / 2 + 30);
    expect(t.kind === "move" && t.move.kind === "split" && [t.move.target, t.move.edge]).toEqual(["p0", "right"]);
  });
});
