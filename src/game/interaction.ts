import type { Card, Ruling } from "../util/scryfall";

/**
 * Wizards publishes rulings per card, never per pair, so "how do these two
 * interact" is answered from what is official: each card's rulings that name
 * the other card, then those that talk about something the other card does
 * (a keyword it has, or a rules action its text performs).
 */
export interface Crossing {
  /** Whose ruling this is. */
  owner: "a" | "b";
  ruling: Ruling;
  /** Why it was picked: the other card's name, or the concepts it shares. */
  because: string[];
  byName: boolean;
  /** Matched one of the other card's printed keywords, not just a rules term. */
  byKeyword: boolean;
}

/** Every name the card can be referred to by: the whole name and each face. */
export function namesOf(card: Card): string[] {
  const names = new Set([card.name, ...card.faces.map((f) => f.name)]);
  // Legendary cards are routinely called by the part before the comma.
  for (const n of [...names]) {
    const short = n.split(",")[0].trim();
    if (short.length >= 4 && short !== n) names.add(short);
  }
  return [...names];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Does `text` use `word`, in any of its plain inflections? "Destroy" matches
 * destroys / destroyed, "Sacrifice" matches sacrificed. Whole words only.
 */
export function mentions(text: string, word: string): boolean {
  const w = word.toLowerCase();
  const stem = w.replace(/e$/, "");
  const forms = stem.length >= 4 && stem !== w ? `(?:${escape(w)}|${escape(stem)})(?:s|es|ed|d|ing)?` : `${escape(w)}(?:s|es|ed|d|ing)?`;
  return new RegExp(`(^|[^\\p{L}])${forms}([^\\p{L}]|$)`, "iu").test(text);
}

/**
 * Rules actions so common that nearly every ruling uses them; matching on
 * them would link everything to everything.
 */
const UBIQUITOUS = new Set([
  "activate", "cast", "play", "create", "reveal", "search", "shuffle",
  "tap and untap", "counter", "double", "exchange", "attach", "vote",
  "the ring tempts you",
]);

/**
 * The rules concepts a card brings: its printed keywords, plus any rules
 * keyword its text uses ("destroy", "sacrifice", "exile"...). Matching
 * against rules vocabulary, not arbitrary words, is what keeps "the" from
 * linking every ruling to every card.
 */
export function conceptsOf(card: Card, vocabulary: string[]): string[] {
  const text = card.faces.map((f) => f.oracleText).join("\n");
  const own = new Set(namesOf(card).map((n) => n.toLowerCase()));
  const found = new Map<string, string>();
  for (const k of card.keywords) found.set(k.toLowerCase(), k);
  for (const v of vocabulary) {
    const key = v.toLowerCase();
    if (found.has(key) || own.has(key) || UBIQUITOUS.has(key)) continue;
    if (mentions(text, v)) found.set(key, v);
  }
  return [...found.values()];
}

/**
 * What counts as a rules concept: every keyword ability and action, plus the
 * glossary's multi-word terms ("triggered ability", "basic land type"). Single
 * glossary words are mostly everyday nouns -- card, player, spell -- that
 * would tie every ruling to every card.
 */
export function rulesVocabulary(g: {
  keywords: { name: string }[];
  terms: { name: string }[];
}): string[] {
  const words = new Set(g.keywords.map((k) => k.name));
  for (const t of g.terms) {
    // "Mana Value (Converted Mana Cost)" -> both names; "Dies" stays out.
    for (const name of t.name.split(/[(),]/).map((x) => x.trim())) {
      if (/\s/.test(name) && name.length <= 32) words.add(name);
    }
  }
  return [...words];
}

export function crossRulings(
  a: { card: Card; rulings: Ruling[] },
  b: { card: Card; rulings: Ruling[] },
  vocabulary: string[],
): Crossing[] {
  const out: Crossing[] = [];
  const side = (
    owner: "a" | "b",
    mine: { card: Card; rulings: Ruling[] },
    theirs: Card,
  ) => {
    const names = namesOf(theirs);
    const concepts = conceptsOf(theirs, vocabulary);
    for (const ruling of mine.rulings) {
      const byName = names.some((n) => mentions(ruling.text, n));
      const because = byName
        ? [theirs.name]
        : concepts.filter((c) => mentions(ruling.text, c));
      const printed = new Set(theirs.keywords.map((k) => k.toLowerCase()));
      const byKeyword = !byName && because.some((c) => printed.has(c.toLowerCase()));
      if (because.length) out.push({ owner, ruling, because, byName, byKeyword });
    }
  };
  side("a", a, b.card);
  side("b", b, a.card);
  // Both cards often carry the same ruling word for word; show it once.
  const seen = new Set<string>();
  const unique = out.filter((c) => !seen.has(c.ruling.text) && seen.add(c.ruling.text));
  out.length = 0;
  out.push(...unique);
  // Rulings naming the other card are the closest thing to an official
  // answer; then the ones touching more shared concepts.
  return out.sort(
    (x, y) =>
      Number(y.byName) - Number(x.byName) ||
      Number(y.byKeyword) - Number(x.byKeyword) ||
      y.because.length - x.because.length,
  );
}
