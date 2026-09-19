import { describe, expect, it } from "vitest";
import { seeded } from "./rng";
import { PAIRS, flip, isFaceUp, newMatch, resolve, wasted } from "./match";

const deal = () => newMatch(seeded(7));

/** Indices of the two cards carrying the same glyph, first pair found. */
function findPair(s = deal()) {
  const seen = new Map<string, number>();
  for (let i = 0; i < s.cards.length; i++) {
    const prev = seen.get(s.cards[i].glyph);
    if (prev !== undefined) return [prev, i] as const;
    seen.set(s.cards[i].glyph, i);
  }
  throw new Error("no pair in the deck");
}

function findMismatch(s = deal()) {
  for (let i = 0; i < s.cards.length; i++) {
    for (let j = i + 1; j < s.cards.length; j++) {
      if (s.cards[i].glyph !== s.cards[j].glyph) return [i, j] as const;
    }
  }
  throw new Error("no mismatch in the deck");
}

describe("mana match", () => {
  it("deals every symbol exactly twice", () => {
    const s = deal();
    expect(s.cards).toHaveLength(PAIRS * 2);
    const counts = new Map<string, number>();
    for (const c of s.cards) {
      counts.set(c.glyph, (counts.get(c.glyph) ?? 0) + 1);
    }
    expect([...counts.values()]).toEqual(Array(PAIRS).fill(2));
  });

  it("shuffles — two seeds do not deal the same order", () => {
    const a = newMatch(seeded(1)).cards.map((c) => c.glyph).join("");
    const b = newMatch(seeded(2)).cards.map((c) => c.glyph).join("");
    expect(a).not.toEqual(b);
  });

  it("starts with nothing face up", () => {
    const s = deal();
    expect(s.cards.some((c) => c.matched)).toBe(false);
    expect(s.up).toEqual([]);
  });

  it("keeps a matched pair face up and empties the compare slot", () => {
    const [a, b] = findPair();
    const s = flip(flip(deal(), a), b);
    expect(s.cards[a].matched).toBe(true);
    expect(s.cards[b].matched).toBe(true);
    expect(s.up).toEqual([]);
    expect(isFaceUp(s, a)).toBe(true);
  });

  it("leaves a mismatched pair showing until it is resolved", () => {
    const [a, b] = findMismatch();
    const s = flip(flip(deal(), a), b);
    expect(s.up).toEqual([a, b]);
    expect(s.cards[a].matched).toBe(false);
    expect(resolve(s).up).toEqual([]);
    // Resolving must not secretly match them.
    expect(resolve(s).cards.some((c) => c.matched)).toBe(false);
  });

  it("counts a move per completed pair of flips, not per tap", () => {
    const [a, b] = findMismatch();
    let s = deal();
    expect(flip(s, a).moves).toBe(0);
    s = flip(flip(s, a), b);
    expect(s.moves).toBe(1);
  });

  it("ignores a second tap on the card already showing", () => {
    const s = flip(deal(), 3);
    const again = flip(s, 3);
    expect(again.up).toEqual([3]);
    expect(again.moves).toBe(0);
  });

  it("ignores a tap on an already matched card", () => {
    const [a, b] = findPair();
    const matched = flip(flip(deal(), a), b);
    const after = flip(matched, a);
    expect(after.up).toEqual([]);
    expect(after.moves).toBe(matched.moves);
  });

  it("a third tap clears the mismatch instead of being swallowed", () => {
    const [a, b] = findMismatch();
    const showing = flip(flip(deal(), a), b);
    const third = flip(showing, (b + 1) % 12);
    expect(third.up).toEqual([(b + 1) % 12]);
  });

  it("finishes when the last pair is matched, and then ignores taps", () => {
    let s = deal();
    const byGlyph = new Map<string, number[]>();
    s.cards.forEach((c, i) => {
      byGlyph.set(c.glyph, [...(byGlyph.get(c.glyph) ?? []), i]);
    });
    for (const [a, b] of byGlyph.values()) s = flip(flip(s, a), b);
    expect(s.done).toBe(true);
    expect(s.moves).toBe(PAIRS);
    expect(wasted(s)).toBe(0);
    // Perfect play is PAIRS tries; the score must not keep climbing after.
    expect(flip(s, 0)).toBe(s);
  });

  it("ignores taps outside the board", () => {
    const s = deal();
    expect(flip(s, -1)).toBe(s);
    expect(flip(s, 99)).toBe(s);
  });

  it("counts tries over perfect play", () => {
    const [a, b] = findMismatch();
    const s = flip(flip(deal(), a), b);
    expect(wasted({ ...s, moves: PAIRS + 3 })).toBe(3);
    expect(wasted({ ...s, moves: 2 })).toBe(0);
  });
});
