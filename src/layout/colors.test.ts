import { describe, expect, it } from "vitest";
import { PLAYER_COLORS, contrastRatio, textOn } from "./colors";

describe("textOn never returns an illegible ink", () => {
  // The life total is the whole app. Whatever colour a player picks from the
  // wheel, the number on top of it has to stay readable.
  const sweep: string[] = [];
  for (let r = 0; r <= 255; r += 17)
    for (let g = 0; g <= 255; g += 17)
      for (let b = 0; b <= 255; b += 17)
        sweep.push(
          `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`,
        );

  it(`clears 3:1 on all ${sweep.length} colours across the cube`, () => {
    const bad = sweep.filter((c) => contrastRatio(textOn(c), c) < 3);
    expect(bad.slice(0, 10)).toEqual([]);
    expect(bad).toHaveLength(0);
  });

  it("discriminates — a pure-perceived-luminance rule would fail this sweep", () => {
    // What the old implementation did, reproduced here so the regression is
    // pinned rather than described.
    const old = (hex: string) => {
      const m = hex.replace("#", "");
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16));
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62
        ? "#0d0d0d"
        : "#ffffff";
    };
    const bad = sweep.filter((c) => contrastRatio(old(c), c) < 3);
    expect(bad.length).toBeGreaterThan(0);
  });

  it("leaves every seat preset on the ink it already had", () => {
    // A different ink on a shipped preset would be a visible regression for
    // everyone, so the fallback must not fire for any of them.
    expect(PLAYER_COLORS.map(textOn)).toEqual([
      "#0d0d0d", // gold
      "#ffffff", // blue
      "#ffffff", // magenta
      "#ffffff", // red
      "#ffffff", // green
      "#ffffff", // purple
    ]);
  });
});
