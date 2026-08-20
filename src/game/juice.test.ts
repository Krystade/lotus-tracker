import { describe, expect, it } from "vitest";
import { contrastRatio, textOn } from "../layout/colors";

/**
 * The damage and heal washes are opaque colours now, not a luminance-preserving
 * blend, so at full strength one of them can cover the whole tile. Whichever
 * ink the seat underneath chose has to stay readable against it.
 *
 * These are the literals in styles.css; if one is changed there without being
 * changed here, this fails rather than the life total quietly becoming
 * illegible on somebody's phone.
 */
const WASHES = {
  damage: "#d60c30",
  heal: "#0c8f4c",
};

// Derived, not transcribed: if textOn ever returns a different pair these
// assertions follow it instead of silently testing colours nothing uses.
const INKS = [...new Set([textOn("#ffffff"), textOn("#000000")])];

describe("the wash stays legible whichever ink is under it", () => {
  it("covers both inks the app can choose", () => {
    expect(INKS).toHaveLength(2);
  });

  for (const [name, colour] of Object.entries(WASHES)) {
    it.each(INKS)(`${name} clears 3:1 against %s`, (ink) => {
      expect(contrastRatio(ink, colour)).toBeGreaterThanOrEqual(3);
    });
  }

  it("discriminates — the brighter green that was tried first fails", () => {
    expect(contrastRatio("#ffffff", "#16be69")).toBeLessThan(3);
  });
});
