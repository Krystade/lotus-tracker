/** Life can go negative in MTG (you're just dead at <= 0), but we clamp the
 *  displayable range to avoid runaway values from a stuck press-and-hold. */
export const LIFE_MIN = -999;
export const LIFE_MAX = 9999;

export function clampLife(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < LIFE_MIN) return LIFE_MIN; // handles -Infinity
  if (value > LIFE_MAX) return LIFE_MAX; // handles +Infinity
  return value;
}

/** Clamp a starting-life value to a sane, finite range. */
export function clampStartingLife(value: number): number {
  if (!Number.isFinite(value)) return 40;
  return Math.max(1, Math.min(999, Math.round(value)));
}

export function applyLifeDelta(current: number, delta: number): number {
  return clampLife(current + delta);
}

/** Counters never go below zero. */
export function clampCounter(value: number): number {
  return value < 0 ? 0 : value;
}
