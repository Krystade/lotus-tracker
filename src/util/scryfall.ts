/**
 * Card text and official rulings from Scryfall (https://scryfall.com/docs/api),
 * which republishes Wizards' Gatherer rulings. Network only: there is no
 * offline copy of every card, so callers must handle failure.
 *
 * Scryfall asks for no more than ~10 requests a second; lookups here are one
 * person typing, debounced, and every answer is cached for the session.
 */
const API = "https://api.scryfall.com";

export interface CardFace {
  name: string;
  manaCost: string;
  typeLine: string;
  oracleText: string;
}

export interface Card {
  id: string;
  name: string;
  faces: CardFace[];
  keywords: string[];
  image?: string;
  scryfallUri: string;
}

export interface Ruling {
  /** "wotc" for Wizards' official rulings; "scryfall" for Scryfall's own notes. */
  source: string;
  date: string;
  text: string;
}

const cache = new Map<string, Promise<unknown>>();

async function get<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit) return hit as Promise<T>;
  const p = fetch(API + path, { headers: { Accept: "application/json" } }).then(async (r) => {
    if (r.status === 404) throw new LookupError("notfound");
    if (!r.ok) throw new LookupError("failed");
    return r.json() as Promise<T>;
  });
  cache.set(path, p);
  // A failure is not an answer: let the next attempt ask again.
  p.catch(() => cache.delete(path));
  return p;
}

export class LookupError extends Error {
  constructor(public reason: "notfound" | "failed" | "offline") {
    super(reason);
  }
}

const wrap = async <T>(p: () => Promise<T>): Promise<T> => {
  try {
    return await p();
  } catch (e) {
    if (e instanceof LookupError) throw e;
    // fetch() rejects with a TypeError when there is no connection at all.
    throw new LookupError(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "failed");
  }
};

export function autocomplete(q: string): Promise<string[]> {
  const t = q.trim();
  if (t.length < 2) return Promise.resolve([]);
  return wrap(() =>
    get<{ data: string[] }>(`/cards/autocomplete?q=${encodeURIComponent(t)}`).then((r) => r.data),
  );
}

interface RawFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  image_uris?: { normal?: string };
}
interface RawCard extends RawFace {
  id: string;
  keywords?: string[];
  card_faces?: RawFace[];
  rulings_uri: string;
  scryfall_uri: string;
}

const face = (f: RawFace): CardFace => ({
  name: f.name,
  manaCost: f.mana_cost ?? "",
  typeLine: f.type_line ?? "",
  oracleText: f.oracle_text ?? "",
});

export function toCard(c: RawCard): Card {
  const faces = c.card_faces?.length ? c.card_faces.map(face) : [face(c)];
  return {
    id: c.id,
    name: c.name,
    faces,
    keywords: c.keywords ?? [],
    image: c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal,
    scryfallUri: c.scryfall_uri,
  };
}

/** Exact name first (what autocomplete hands back), then a forgiving match. */
export function cardNamed(name: string): Promise<Card> {
  const q = encodeURIComponent(name.trim());
  return wrap(() =>
    get<RawCard>(`/cards/named?exact=${q}`)
      .catch((e) => {
        if (e instanceof LookupError && e.reason === "notfound") return get<RawCard>(`/cards/named?fuzzy=${q}`);
        throw e;
      })
      .then(toCard),
  );
}

export function rulingsFor(card: Card): Promise<Ruling[]> {
  return wrap(() =>
    get<{ data: { source: string; published_at: string; comment: string }[] }>(
      `/cards/${card.id}/rulings`,
    ).then((r) => r.data.map((x) => ({ source: x.source, date: x.published_at, text: x.comment }))),
  );
}
