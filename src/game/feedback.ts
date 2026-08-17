/**
 * Decides what a life change should *feel* like. Kept pure and separate from
 * the tile so the thresholds are testable and the same event drives the
 * visual, the haptic, and (later) anything else.
 */

export type FeedbackKind = "damage" | "heal" | "death";
/** 1 = a tap, 2 = a few points, 3 = a press-and-hold swing or a death. */
export type Intensity = 1 | 2 | 3;

export interface Feedback {
  kind: FeedbackKind;
  intensity: Intensity;
}

/** A press-and-hold steps by ten, so that is the natural "big hit" line. */
const BIG_SWING = 10;
const MEDIUM_SWING = 3;

export function intensityFor(magnitude: number): Intensity {
  if (magnitude >= BIG_SWING) return 3;
  if (magnitude >= MEDIUM_SWING) return 2;
  return 1;
}

export interface LifeSnapshot {
  life: number;
  dead: boolean;
}

/**
 * What just happened to this player, or null if nothing worth reacting to.
 * Dying outranks the life change that caused it, and only fires on the
 * crossing — not on every later edit to an already-dead player.
 */
export function feedbackFor(
  prev: LifeSnapshot,
  next: LifeSnapshot,
): Feedback | null {
  if (!prev.dead && next.dead) return { kind: "death", intensity: 3 };

  const delta = next.life - prev.life;
  if (delta === 0) return null;
  return {
    kind: delta < 0 ? "damage" : "heal",
    intensity: intensityFor(Math.abs(delta)),
  };
}

/**
 * Vibration pattern for an event, in the shape navigator.vibrate wants.
 * Returns 0 for events that should stay silent — healing a point at a time
 * during setup should not buzz the table.
 */
export function vibrationFor(f: Feedback): number | number[] {
  if (f.kind === "death") return [90, 60, 90, 60, 170];
  if (f.kind === "heal") return f.intensity === 1 ? 0 : f.intensity === 2 ? 14 : 26;
  return f.intensity === 1 ? 18 : f.intensity === 2 ? 38 : 65;
}
