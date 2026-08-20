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

function rgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** WCAG relative luminance. Distinct from the perceived-luminance shortcut
 *  textOn uses to pick an ink colour — this one is for measuring contrast. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Rotates hue and nudges saturation, leaving lightness alone.
 *
 * This is how a look gains visible variety without spending contrast. Half the
 * palette takes white text, which leaves almost no headroom to lighten a
 * layer — but shifting a blue toward cyan is just as visible and costs nothing
 * against the ink, because relative luminance barely moves.
 */
export function rotateHue(hex: string, degrees: number, satBoost = 0): string {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  h = (h + degrees / 360 + 1) % 1;
  s = Math.max(0, Math.min(1, s + satBoost));

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const to = (t: number) => {
    let x = (t + 1) % 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const parts = [to(h + 1 / 3), to(h), to(h - 1 / 3)].map((v) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${parts.join("")}`;
}

/** Mixes toward black (t < 0) or white (t > 0) by a fraction. */
export function shift(hex: string, t: number): string {
  const target = t < 0 ? 0 : 255;
  const amount = Math.abs(t);
  const parts = rgb(hex).map((v) =>
    Math.round(v + (target - v) * amount)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${parts.join("")}`;
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

/**
 * Linear interpolation between two hex colours in sRGB.
 *
 * sRGB rather than a perceptual space on purpose: the result feeds the same
 * contrast clamp as every other derived colour, so the guarantee holds either
 * way, and sRGB is what the slider's midpoint looks like to someone dragging
 * it — a perceptual blend would make the handle position feel non-linear.
 */
export function mix(a: string, b: string, t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const ch = (x: number, y: number) =>
    Math.round(x + (y - x) * clamped)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
}
