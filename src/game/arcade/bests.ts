/**
 * Best scores, and the only place that knows which direction is better.
 *
 * Two of the three games score low (moves, milliseconds) and one scores high
 * (rounds). Keeping that in one table stops a component from deciding it.
 */
export interface ArcadeGame {
  id: string;
  name: string;
  blurb: string;
  /** True when a smaller number is a better score. */
  lower: boolean;
  unit: string;
}

export const ARCADE_GAMES: ArcadeGame[] = [
  {
    id: "match",
    name: "Mana Match",
    blurb: "Six pairs, fewest tries",
    lower: true,
    unit: "tries",
  },
  {
    id: "chant",
    name: "Chant",
    blurb: "Play the colour sequence back",
    lower: false,
    unit: "rounds",
  },
  {
    id: "draw",
    name: "Quick Draw",
    blurb: "Tap the second it flips",
    lower: true,
    unit: "ms",
  },
];

export function gameById(id: string): ArcadeGame | undefined {
  return ARCADE_GAMES.find((g) => g.id === id);
}

/** A score only counts if the game exists and the number is real. */
export function isBetter(
  gameId: string,
  next: number,
  prev: number | undefined,
): boolean {
  const game = gameById(gameId);
  if (!game) return false;
  if (!Number.isFinite(next)) return false;
  if (prev === undefined || !Number.isFinite(prev)) return true;
  return game.lower ? next < prev : next > prev;
}

export function formatBest(gameId: string, value: number): string {
  const game = gameById(gameId);
  return game ? `${value} ${game.unit}` : String(value);
}
