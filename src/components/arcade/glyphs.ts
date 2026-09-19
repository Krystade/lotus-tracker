import { textOn } from "../../layout/colors";
import type { Glyph } from "../../game/arcade/symbols";

/** Card-face colours, close enough to the real pips to read instantly. */
export const GLYPH_COLOR: Record<Glyph, string> = {
  W: "#f3ead0",
  U: "#3d7fd6",
  B: "#4b414a",
  R: "#d6483c",
  G: "#42a161",
  C: "#b0a89e",
};

/**
 * Letters, not emoji. A Magic player reads WUBRG without thinking, the glyphs
 * render identically on every device, and the letter carries the meaning for
 * anyone who cannot separate the colours.
 */
export const GLYPH_LETTER: Record<Glyph, string> = {
  W: "W",
  U: "U",
  B: "B",
  R: "R",
  G: "G",
  C: "C",
};

export const inkFor = (g: Glyph) => textOn(GLYPH_COLOR[g]);
