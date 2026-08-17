import { PLAYER_COLORS, contrastRatio, rotateHue, shift, textOn } from "./colors";

/**
 * A tile look is a hue crossed with a style.
 *
 * Everything is pure CSS — no images — so looks cost nothing to store, work
 * offline, and render at any tile rotation. Styles are one rule set each,
 * driven by custom properties, so six hues do not mean six copies.
 *
 * The rule that keeps the life total readable: contrast is decided from the
 * hue's flat `base`, never from rendered pixels, and every colour a style
 * paints stays close enough to that base for the choice to hold. looks.test.ts
 * asserts this across the whole catalogue.
 */

export interface Hue {
  id: string;
  name: string;
  base: string;
}

export interface LookStyle {
  id: string;
  name: string;
  animated: boolean;
  /** How many decorative layers the tile renders for this style. */
  layers: number;
}

export const HUES: Hue[] = [
  { id: "gold", name: "Gold", base: PLAYER_COLORS[0] },
  { id: "blue", name: "Blue", base: PLAYER_COLORS[1] },
  { id: "magenta", name: "Magenta", base: PLAYER_COLORS[2] },
  { id: "red", name: "Red", base: PLAYER_COLORS[3] },
  { id: "green", name: "Green", base: PLAYER_COLORS[4] },
  { id: "purple", name: "Purple", base: PLAYER_COLORS[5] },
];

// `solid` must stay first: it is the default, and defaultLookFor indexes it.
export const LOOK_STYLES: LookStyle[] = [
  { id: "solid", name: "Solid", animated: false, layers: 0 },
  { id: "fade", name: "Fade", animated: false, layers: 0 },
  { id: "stripe", name: "Stripes", animated: false, layers: 0 },
  { id: "drift", name: "Drift", animated: true, layers: 2 },
  { id: "lava", name: "Lava", animated: true, layers: 3 },
  { id: "nebula", name: "Nebula", animated: true, layers: 3 },
  { id: "ribbons", name: "Ribbons", animated: true, layers: 3 },
  { id: "tide", name: "Tide", animated: true, layers: 2 },
  { id: "pulse", name: "Pulse", animated: true, layers: 2 },
  { id: "smoke", name: "Smoke", animated: true, layers: 1 },
  { id: "marble", name: "Marble", animated: true, layers: 1 },
];

/**
 * How far each style's darkest and lightest paint reaches for. These are
 * ambitions, not guarantees — `within` pulls them back until the life total
 * still clears 3:1 against them.
 */
const LO = -0.34;
const HI = 0.3;

/** WCAG large-text minimum, with a hair of margin. The life total is huge. */
const MIN_CONTRAST = 3.05;

/**
 * Shifts `base` by `t`, backing off until the result still clears MIN_CONTRAST
 * against the ink chosen for that base.
 *
 * The band cannot be symmetric. A dark hue takes white text, so lightening a
 * layer spends contrast while darkening it gains contrast; for a light hue it
 * is the other way round. Clamping per direction is what lets every hue keep
 * as much depth as it can afford rather than every hue being limited by the
 * worst one.
 */
function within(base: string, t: number): string {
  const ink = textOn(base);
  let amount = t;
  for (let i = 0; i < 24 && Math.abs(amount) > 0.005; i++) {
    const candidate = shift(base, amount);
    if (contrastRatio(ink, candidate) >= MIN_CONTRAST) return candidate;
    amount *= 0.85;
  }
  return base;
}

export interface ResolvedLook {
  id: string;
  hueId: string;
  styleId: string;
  name: string;
  /** The flat colour contrast is decided from. */
  base: string;
  /** Custom properties the style's CSS reads. */
  vars: Record<string, string>;
  animated: boolean;
  layers: number;
  /** Every colour this look actually paints, for the contrast test. */
  paintedColours: string[];
}

/**
 * A fractal-noise field baked into an SVG data URI.
 *
 * The noise is generated once into an image rather than living as a live
 * filter on the tile: a live feTurbulence recomputes every frame, which is
 * what made an earlier attempt boil in place instead of drifting. As an image
 * it is rasterised once and then simply moved, and six tiles cannot collide
 * over duplicate filter ids.
 */
function noiseDataUri(colour: string, frequency: number, octaves: number, seed: number, cut: number): string {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(colour.replace("#", "").slice(i - 1, i + 1), 16) / 255,
  );
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='520' height='520'>` +
    `<filter id='n' x='0' y='0' width='100%' height='100%'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='${octaves}' seed='${seed}'/>` +
    `<feColorMatrix type='matrix' values='0 0 0 0 ${r.toFixed(3)} 0 0 0 0 ${g.toFixed(3)} 0 0 0 0 ${b.toFixed(3)} 0 0 0 ${-cut} ${cut.toFixed(2)}'/>` +
    `</filter><rect width='520' height='520' filter='url(#n)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function lookId(hueId: string, styleId: string): string {
  return styleId === "solid" ? hueId : `${hueId}-${styleId}`;
}

export function allLookIds(): string[] {
  return HUES.flatMap((h) => LOOK_STYLES.map((s) => lookId(h.id, s.id)));
}

/**
 * The two derived colours every style paints with.
 *
 * Variety comes from rotating hue as well as shifting lightness. A dark hue
 * takes white text and so has almost no room to lighten; rotating it toward a
 * neighbour is just as visible and costs no contrast.
 *
 * Shared by the catalogue and the fallback deliberately. When the fallback
 * derived its own palette it skipped the contrast clamp entirely — harmless
 * only because the fallback happens to paint no layers, and invisible to the
 * catalogue test, which iterates allLookIds() and never sees it.
 */
function paletteFor(base: string): { lo: string; hi: string } {
  return {
    lo: within(rotateHue(base, -22, 0.05), LO),
    hi: within(rotateHue(base, 20, 0.08), HI),
  };
}

function build(hue: Hue, style: LookStyle): ResolvedLook {
  const { lo, hi } = paletteFor(hue.base);
  const vars: Record<string, string> = {
    "--look-base": hue.base,
    "--look-lo": lo,
    "--look-hi": hi,
  };
  if (style.id === "smoke") vars["--look-noise"] = noiseDataUri(hi, 0.022, 4, 11, 0.78);
  if (style.id === "marble") vars["--look-noise"] = noiseDataUri(hi, 0.014, 5, 3, 0.88);
  return {
    id: lookId(hue.id, style.id),
    hueId: hue.id,
    styleId: style.id,
    name: style.id === "solid" ? hue.name : `${hue.name} ${style.name.toLowerCase()}`,
    base: hue.base,
    vars,
    animated: style.animated,
    layers: style.layers,
    paintedColours: style.id === "solid" ? [hue.base] : [hue.base, lo, hi],
  };
}

/** The look for a seat when nothing has been chosen. */
export function defaultLookFor(seat: number): ResolvedLook {
  return build(HUES[seat % HUES.length], LOOK_STYLES[0]);
}

/**
 * Resolves a stored look id. Legacy ids (`blue`, `blue-fade`, `blue-stripe`)
 * are already the solid/fade/stripe cases of this scheme, so they need no
 * migration. Anything unrecognised falls back to a flat fill of the player's
 * own colour, which is how tiles rendered before looks existed.
 */
export function resolveLook(
  lookId: string | undefined | null,
  color: string,
): ResolvedLook {
  const fallback: ResolvedLook = {
    id: "custom",
    hueId: "custom",
    styleId: "solid",
    name: "Custom",
    base: color,
    vars: {
      "--look-base": color,
      "--look-lo": paletteFor(color).lo,
      "--look-hi": paletteFor(color).hi,
    },
    animated: false,
    layers: 0,
    paintedColours: [color],
  };
  if (!lookId) return fallback;

  const dash = lookId.indexOf("-");
  const hueId = dash === -1 ? lookId : lookId.slice(0, dash);
  const styleId = dash === -1 ? "solid" : lookId.slice(dash + 1);

  const hue = HUES.find((h) => h.id === hueId);
  const style = LOOK_STYLES.find((s) => s.id === styleId);
  if (!hue || !style) return fallback;
  return build(hue, style);
}
