import { PLAYER_COLORS } from "./colors";

/**
 * A tile background a player can choose. Everything is pure CSS — no images —
 * so looks cost nothing to store, survive being offline, and render correctly
 * at any tile rotation.
 *
 * `base` is the flat colour the look is built from. Text contrast is decided
 * from it rather than from the rendered pixels, so the life total's legibility
 * is a property of the catalogue rather than a guess.
 */
export interface Look {
  id: string;
  name: string;
  base: string;
  /** CSS `background` value. */
  css: string;
}

const HUES: Array<[key: string, name: string, hex: string]> = [
  ["gold", "Gold", PLAYER_COLORS[0]],
  ["blue", "Blue", PLAYER_COLORS[1]],
  ["magenta", "Magenta", PLAYER_COLORS[2]],
  ["red", "Red", PLAYER_COLORS[3]],
  ["green", "Green", PLAYER_COLORS[4]],
  ["purple", "Purple", PLAYER_COLORS[5]],
];

/** Darken a hex by a factor, for gradient stops and pattern ink. */
function shade(hex: string, factor: number): string {
  const m = hex.replace("#", "");
  const parts = [0, 2, 4].map((i) => {
    const v = Math.round(parseInt(m.slice(i, i + 2), 16) * factor);
    return Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  });
  return `#${parts.join("")}`;
}

function looksForHue(key: string, name: string, hex: string): Look[] {
  const dark = shade(hex, 0.62);
  const ink = shade(hex, 0.78);
  return [
    { id: `${key}`, name, base: hex, css: hex },
    {
      id: `${key}-fade`,
      name: `${name} fade`,
      base: hex,
      css: `linear-gradient(150deg, ${hex} 0%, ${dark} 100%)`,
    },
    {
      id: `${key}-stripe`,
      name: `${name} stripes`,
      base: hex,
      css: `repeating-linear-gradient(135deg, ${hex} 0 18px, ${ink} 18px 36px)`,
    },
  ];
}

export const LOOKS: Look[] = HUES.flatMap(([k, n, h]) => looksForHue(k, n, h));

export function lookById(id: string | undefined): Look | undefined {
  return id ? LOOKS.find((l) => l.id === id) : undefined;
}

/** The look for a seat when the player has not chosen one. */
export function defaultLookFor(seat: number): Look {
  return LOOKS[(seat % HUES.length) * 3];
}

/**
 * Resolves what a tile should paint: the chosen look, else the player's plain
 * colour (which is how every game before looks existed was stored).
 */
export function resolveLook(lookId: string | undefined, color: string): Look {
  return lookById(lookId) ?? { id: "custom", name: "Custom", base: color, css: color };
}
