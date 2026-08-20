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
/** Hue, saturation and lightness, each 0..1. Hue wraps. */
function toHsl(hex: string): { h: number; s: number; l: number } {
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
  return { h, s, l };
}

function fromHsl(h: number, s: number, l: number): string {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const to = (t: number) => {
    const x = (t + 1) % 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const parts = [to(h + 1 / 3), to(h), to(h - 1 / 3)].map((v) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${parts.join("")}`;
}

export function rotateHue(hex: string, degrees: number, satBoost = 0): string {
  const { h, s, l } = toHsl(hex);
  return fromHsl(
    (h + degrees / 360 + 1) % 1,
    Math.max(0, Math.min(1, s + satBoost)),
    l,
  );
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
 * sRGB <-> OKLCH, used for blending two chosen colours.
 *
 * HSL is fine for nudging one colour into a variation of itself, which is all
 * rotateHue does. It is the wrong space to travel between two colours in:
 * its "lightness" is not perceptual, so a blend that keeps L constant still
 * sags in apparent brightness through the yellow-orange range -- green to
 * magenta came out olive and brown across its middle. OKLab was built so that
 * equal steps look equal, and its polar form lets hue and colourfulness move
 * independently, which is what keeps every step of the mix as vivid as its
 * ends.
 */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function toOklch(hex: string): { l: number; c: number; h: number } {
  const [r, g, b] = rgb(hex).map((v) => srgbToLinear(v / 255));
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return {
    l: L,
    c: Math.sqrt(A * A + B * B),
    h: Math.atan2(B, A) / (2 * Math.PI), // turns, so it matches HSL's 0..1
  };
}

function fromOklch(l: number, c: number, h: number): string {
  const A = c * Math.cos(h * 2 * Math.PI);
  const B = c * Math.sin(h * 2 * Math.PI);
  const l_ = l + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = l - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = l - 0.0894841775 * A - 1.291485548 * B;
  const [lc, mc, sc] = [l_ * l_ * l_, m_ * m_ * m_, s_ * s_ * s_];
  const lin = [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ];
  // Out-of-gamut results are clipped per channel. Good enough here: every
  // colour that reaches this point is a blend of two in-gamut colours, so
  // excursions are small, and the contrast clamp runs afterwards regardless.
  const parts = lin.map((v) =>
    Math.round(Math.min(1, Math.max(0, linearToSrgb(v))) * 255)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${parts.join("")}`;
}

/**
 * The direction the short way round the hue wheel runs, from `a` to `b`.
 *
 * Computed once per look from the pair the player chose, then forced on every
 * colour derived from it so the whole tile travels together instead of the
 * shadow and the highlight splitting and meeting in the middle.
 */
/**
 * Where dark colours go muddy, in OKLCH hue turns.
 *
 * Hues in the yellow-to-orange band can only reach high chroma when they are
 * also light. Darken one and there is no vivid version of it to reach for --
 * you get olive and brown. Every other part of the wheel keeps its identity
 * when darkened.
 */
const SAG_FROM = 0.15;
const SAG_TO = 0.33;

function crossesSag(from: number, delta: number): boolean {
  const steps = 24;
  for (let i = 1; i < steps; i++) {
    const h = (((from + delta * (i / steps)) % 1) + 1) % 1;
    if (h > SAG_FROM && h < SAG_TO) return true;
  }
  return false;
}

export function hueDirection(a: string, b: string): 1 | -1 {
  const A = toOklch(a);
  const B = toOklch(b);
  let dh = B.h - A.h;
  if (dh > 0.5) dh -= 1;
  if (dh < -0.5) dh += 1;

  // Shortest arc unless it drags the blend through the muddy band. Green to
  // magenta is barely shorter going via yellow than via blue, and the yellow
  // route turns the middle of the slider olive and brown; the blue route
  // stays vivid the whole way. If an endpoint already sits in that band there
  // is nothing to avoid, so the length rule stands.
  const endpointInSag = (h: number) => h > SAG_FROM && h < SAG_TO;
  if (!endpointInSag(A.h) && !endpointInSag(B.h)) {
    const other = dh > 0 ? dh - 1 : dh + 1;
    if (crossesSag(A.h, dh) && !crossesSag(A.h, other)) {
      return other >= 0 ? 1 : -1;
    }
  }
  return dh >= 0 ? 1 : -1;
}

/**
 * Blends two colours through OKLCH.
 *
 * Hue travels round the wheel rather than through the middle, so a pair far
 * apart in hue never passes through their desaturated average -- blue to red
 * used to go grey halfway. Lightness and chroma interpolate linearly in a
 * perceptual space, so the intermediate steps stay as bright and as colourful
 * as the two ends rather than sagging into olive or brown.
 *
 * A colour with no meaningful hue (grey, black, white) has no arc to travel,
 * so those interpolate straight.
 */
export function mix(a: string, b: string, t: number, dir?: 1 | -1): string {
  const amount = Math.min(1, Math.max(0, t));
  const A = toOklch(a);
  const B = toOklch(b);
  const FLAT = 0.02;
  if (A.c < FLAT || B.c < FLAT) {
    const [ar, ag, ab] = rgb(a);
    const [br, bg, bb] = rgb(b);
    const ch = (x: number, y: number) =>
      Math.round(x + (y - x) * amount)
        .toString(16)
        .padStart(2, "0");
    return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
  }
  let dh = B.h - A.h;
  if (dh > 0.5) dh -= 1;
  if (dh < -0.5) dh += 1;
  if (dir === 1 && dh < 0) dh += 1;
  if (dir === -1 && dh > 0) dh -= 1;
  return fromOklch(
    A.l + (B.l - A.l) * amount,
    A.c + (B.c - A.c) * amount,
    A.h + dh * amount,
  );
}
