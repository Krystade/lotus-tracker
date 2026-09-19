import type { Rng } from "./rng";

/**
 * Quick Draw: the card flips at a moment you cannot predict; tap it.
 *
 * The unpredictable wait is the whole game, so the delay is drawn from a wide
 * band -- a fixed one is just a metronome, and anything under a second lets a
 * pre-emptive tap look like a good reflex.
 */
export const MIN_WAIT_MS = 1200;
export const MAX_WAIT_MS = 4600;

export function waitMs(rng: Rng): number {
  return Math.round(MIN_WAIT_MS + rng() * (MAX_WAIT_MS - MIN_WAIT_MS));
}

/** Named for the table, not for the millisecond. */
export function rankOf(ms: number): string {
  if (ms < 200) return "Force of Will";
  if (ms < 260) return "Lightning Bolt";
  if (ms < 340) return "Shock";
  if (ms < 450) return "Sorcery speed";
  return "Land, go.";
}

export type DrawResult =
  | { kind: "early" }
  | { kind: "time"; ms: number; rank: string };

/**
 * `flippedAt` is null while the card is still face down, which is what makes a
 * tap early. Times are taken from performance.now() by the caller.
 */
export function judge(flippedAt: number | null, tappedAt: number): DrawResult {
  if (flippedAt === null) return { kind: "early" };
  const ms = Math.max(0, Math.round(tappedAt - flippedAt));
  return { kind: "time", ms, rank: rankOf(ms) };
}
