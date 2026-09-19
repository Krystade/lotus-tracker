/** Shadowing the global `Symbol` would be asking for trouble, hence Glyph.
 *  The five colours plus colourless, which is what every game here is built
 *  from — a Magic player reads these faster than any abstract shape. */
export const SYMBOLS = ["W", "U", "B", "R", "G", "C"] as const;
export type Glyph = (typeof SYMBOLS)[number];

/** Pads for the sequence game: the five colours only, no colourless. */
export const PADS = ["W", "U", "B", "R", "G"] as const;
export type Pad = (typeof PADS)[number];

export const SYMBOL_NAME: Record<Glyph, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  C: "Colourless",
};
