import { shuffle, type Rng } from "./rng";
import { SYMBOLS, type Glyph } from "./symbols";

/**
 * Mana Match: six pairs face down, find them in as few flips as possible.
 *
 * The rules live here rather than in the component because the interesting
 * cases -- a third flip while a mismatched pair is still showing, a tap on a
 * card that is already up, a tap after the board is cleared -- are the ones a
 * component test would have to fight timers to reach.
 */
export interface Card {
  /** Stable across a game; the index in `cards` is the position on screen. */
  id: number;
  glyph: Glyph;
  matched: boolean;
}

export interface MatchState {
  cards: Card[];
  /** Indices currently face up and unresolved; never more than two. */
  up: number[];
  /** Counted once per completed pair of flips, so it reads as "tries". */
  moves: number;
  done: boolean;
}

export const PAIRS = SYMBOLS.length;

export function newMatch(rng: Rng): MatchState {
  const deck = shuffle([...SYMBOLS, ...SYMBOLS], rng);
  return {
    cards: deck.map((glyph, id) => ({ id, glyph, matched: false })),
    up: [],
    moves: 0,
    done: false,
  };
}

/** Turn a mismatched pair back over. A no-op unless two cards are showing. */
export function resolve(s: MatchState): MatchState {
  if (s.up.length < 2) return s;
  return { ...s, up: [] };
}

export function flip(s: MatchState, index: number): MatchState {
  if (s.done) return s;
  if (index < 0 || index >= s.cards.length) return s;
  // A third tap while a mismatch is showing clears it first, rather than being
  // swallowed -- waiting out the flip-back animation to tap is not a game.
  const base = s.up.length === 2 ? resolve(s) : s;
  if (base.cards[index].matched) return base;
  if (base.up.includes(index)) return base;

  const up = [...base.up, index];
  if (up.length < 2) return { ...base, up };

  const [a, b] = up;
  const moves = base.moves + 1;
  if (base.cards[a].glyph !== base.cards[b].glyph) {
    return { ...base, up, moves };
  }
  // A match stays face up through `matched`, so `up` empties immediately and
  // the next tap needs no pause.
  const cards = base.cards.map((c, i) =>
    i === a || i === b ? { ...c, matched: true } : c,
  );
  return {
    ...base,
    cards,
    up: [],
    moves,
    done: cards.every((c) => c.matched),
  };
}

/** Face up means matched, or one of the two currently being compared. */
export function isFaceUp(s: MatchState, index: number): boolean {
  return s.cards[index].matched || s.up.includes(index);
}

/** Perfect play is one try per pair; this is how many tries over that. */
export function wasted(s: MatchState): number {
  return Math.max(0, s.moves - PAIRS);
}
