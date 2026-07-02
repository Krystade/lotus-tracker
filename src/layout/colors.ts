/** Default player colors, roughly matching Lotus's palette. Index = seat. */
export const PLAYER_COLORS = [
  "#E4B33D", // gold / yellow
  "#3E92CC", // blue
  "#B23A6B", // magenta
  "#B23A2E", // red
  "#4C9A52", // green
  "#7E57C2", // purple
];

export function colorForSeat(seat: number): string {
  return PLAYER_COLORS[seat % PLAYER_COLORS.length];
}

/** Returns near-black or white for legible text on a given hex background. */
export function textOn(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  // Perceived luminance (sRGB weights).
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#0d0d0d" : "#ffffff";
}
