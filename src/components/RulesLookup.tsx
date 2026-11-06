import { useEffect, useMemo, useRef, useState } from "react";
import {
  autocomplete,
  cardNamed,
  LookupError,
  rulingsFor,
  type Card,
  type Ruling,
} from "../util/scryfall";
import { conceptsOf, crossRulings, rulesVocabulary } from "../game/interaction";

type Glossary = typeof import("../data/rules-glossary.json");
type Keyword = Glossary["keywords"][number];

// The rules text is a few hundred KB, so it is its own chunk, loaded the
// first time anyone opens a lookup (and precached for offline after that).
let glossaryP: Promise<Glossary> | null = null;
function useGlossary(): Glossary | null {
  const [g, setG] = useState<Glossary | null>(null);
  useEffect(() => {
    let live = true;
    glossaryP ??= import("../data/rules-glossary.json").then((m) => m.default as Glossary);
    glossaryP.then((x) => live && setG(x));
    return () => {
      live = false;
    };
  }, []);
  return g;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

/** Keyword definitions and card rulings, inside a player's own panel. */
export function RulesLookup({
  mode,
  onBack,
}: {
  mode: "keywords" | "cards";
  onBack: () => void;
}) {
  const glossary = useGlossary();
  return (
    <div className="lookup">
      <button className="lookup__back" onClick={onBack}>
        ‹ Back
      </button>
      {!glossary ? (
        <p className="lookup__note">Loading rules…</p>
      ) : mode === "keywords" ? (
        <KeywordLookup glossary={glossary} />
      ) : (
        <CardLookup glossary={glossary} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- keywords

type Entry =
  | { type: "keyword"; name: string; k: Keyword }
  | { type: "term"; name: string; summary: string };

function KeywordLookup({ glossary }: { glossary: Glossary }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Entry | null>(null);

  const all = useMemo<Entry[]>(
    () => [
      ...glossary.keywords.map((k) => ({ type: "keyword" as const, name: k.name, k })),
      ...glossary.terms.map((t) => ({ type: "term" as const, name: t.name, summary: t.summary })),
    ],
    [glossary],
  );

  const results = useMemo(() => {
    const n = norm(q);
    if (!n) return all.filter((e) => e.type === "keyword").sort((a, b) => a.name.localeCompare(b.name));
    const score = (e: Entry) => {
      const name = norm(e.name);
      if (name === n) return 0;
      if (name.startsWith(n)) return 1;
      if (name.split(" ").some((w) => w.startsWith(n))) return 2;
      if (name.includes(n)) return 3;
      return 9;
    };
    return all
      .map((e) => [score(e) + (e.type === "term" ? 0.5 : 0), e] as const)
      .filter(([s]) => s < 9)
      .sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name))
      .map(([, e]) => e)
      .slice(0, 40);
  }, [q, all]);

  if (open) {
    return (
      <div className="lookup__detail">
        <button className="lookup__crumb" onClick={() => setOpen(null)}>
          ‹ All keywords
        </button>
        <KeywordCard entry={open} />
        <p className="lookup__source">
          Comprehensive Rules, effective {glossary.effective}.
        </p>
      </div>
    );
  }

  return (
    <>
      <input
        className="lookup__input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Look up a keyword: deathtouch, ward, scry…"
        aria-label="keyword search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <ul className="lookup__list">
        {results.map((e) => (
          <li key={`${e.type}:${e.name}`}>
            <button className="lookup__item" onClick={() => setOpen(e)}>
              <span>{e.name}</span>
              <em>{e.type === "keyword" ? (e.k.kind === "ability" ? "keyword" : "action") : "rules term"}</em>
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="lookup__note">Nothing in the rules by that name.</li>}
      </ul>
    </>
  );
}

function KeywordCard({ entry, compact = false }: { entry: Entry; compact?: boolean }) {
  if (entry.type === "term") {
    return (
      <div className="kw">
        {!compact && <h4 className="kw__name">{entry.name}</h4>}
        <p className="kw__summary">{entry.summary}</p>
      </div>
    );
  }
  const k = entry.k;
  return (
    <div className="kw">
      {!compact && (
        <h4 className="kw__name">
          {k.name} <em>{k.kind === "ability" ? "Keyword ability" : "Keyword action"} · {k.rule}</em>
        </h4>
      )}
      {k.summary && <p className="kw__summary">{k.summary}</p>}
      <ol className="kw__rules">
        {k.rules.map((r) => (
          <li key={r.id}>
            <b>{r.id}</b> {r.text}
            {"examples" in r &&
              (r as { examples?: string[] }).examples?.map((x, i) => (
                <p key={i} className="kw__example">
                  Example: {x}
                </p>
              ))}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- cards

interface Loaded {
  card: Card;
  rulings: Ruling[];
}

type Slot =
  | { state: "empty" }
  | { state: "loading"; name: string }
  | { state: "ready"; data: Loaded }
  | { state: "error"; name: string; reason: LookupError["reason"] };

function CardLookup({ glossary }: { glossary: Glossary }) {
  const [a, setA] = useState<Slot>({ state: "empty" });
  const [b, setB] = useState<Slot>({ state: "empty" });
  const [comparing, setComparing] = useState(false);
  const vocab = useMemo(() => rulesVocabulary(glossary), [glossary]);

  const load = (set: (s: Slot) => void) => (name: string) => {
    set({ state: "loading", name });
    cardNamed(name)
      .then(async (card) => set({ state: "ready", data: { card, rulings: await rulingsFor(card) } }))
      .catch((e: unknown) =>
        set({ state: "error", name, reason: e instanceof LookupError ? e.reason : "failed" }),
      );
  };

  const both = a.state === "ready" && b.state === "ready";
  const crossings = both ? crossRulings(a.data, b.data, vocab) : [];

  return (
    <>
      <div className="lookup__slots">
      <CardSlot label="Card" slot={a} onPick={load(setA)} onClear={() => setA({ state: "empty" })} />
      {comparing ? (
        <CardSlot
          label="With"
          slot={b}
          onPick={load(setB)}
          onClear={() => {
            setB({ state: "empty" });
            setComparing(false);
          }}
        />
      ) : (
        a.state === "ready" && (
          <button className="lookup__compare" onClick={() => setComparing(true)}>
            + How does it interact with another card?
          </button>
        )
      )}
      </div>

      {both && (
        <section className="lookup__section">
          <h3>
            {a.data.card.name} + {b.data.card.name}
          </h3>
          <p className="lookup__note">
            Wizards rules on single cards, not pairs. These are each card's official
            rulings that name the other card or deal with something it does.
          </p>
          {crossings.length === 0 ? (
            <p className="lookup__note lookup__note--strong">
              No ruling on either card touches the other. Check both cards' rulings and
              keywords below.
            </p>
          ) : (
            <ul className="rulings">
              {crossings.map((c, i) => (
                <li key={i} className={`ruling${c.byName ? " ruling--named" : ""}`}>
                  <span className="ruling__tags">
                    <b>{(c.owner === "a" ? a.data : b.data).card.name}</b>
                    {c.because.map((t) => (
                      <span key={t} className="ruling__tag">
                        {c.byName ? "names it" : t}
                      </span>
                    ))}
                  </span>
                  <RulingText r={c.ruling} />
                </li>
              ))}
            </ul>
          )}
          <SharedRules a={a.data.card} b={b.data.card} glossary={glossary} vocab={vocab} />
        </section>
      )}

      {a.state === "ready" && <CardDetails data={a.data} glossary={glossary} />}
      {b.state === "ready" && <CardDetails data={b.data} glossary={glossary} />}
    </>
  );
}

function CardSlot({
  label,
  slot,
  onPick,
  onClear,
}: {
  label: string;
  slot: Slot;
  onPick: (name: string) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const [hints, setHints] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setHints([]);
      return;
    }
    let live = true;
    timer.current = window.setTimeout(() => {
      autocomplete(q)
        .then((h) => {
          if (!live) return;
          setHints(h.slice(0, 8));
          setError(null);
        })
        .catch((e: unknown) => {
          if (!live) return;
          setHints([]);
          setError(e instanceof LookupError && e.reason === "offline" ? offlineText : failedText);
        });
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer.current);
    };
  }, [q]);

  if (slot.state === "ready" || slot.state === "loading") {
    const name = slot.state === "ready" ? slot.data.card.name : slot.name;
    return (
      <div className="slot">
        <span className="slot__label">{label}</span>
        <span className="slot__name">{name}</span>
        {slot.state === "loading" && <span className="lookup__note">loading…</span>}
        <button className="slot__clear" onClick={onClear} aria-label={`clear ${name}`}>
          ✕
        </button>
      </div>
    );
  }

  const pick = (name: string) => {
    setQ("");
    setHints([]);
    onPick(name);
  };

  return (
    <div className="slot slot--search">
      <input
        className="lookup__input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && q.trim()) pick(hints[0] ?? q);
        }}
        placeholder={label === "Card" ? "Card name…" : "Second card name…"}
        aria-label={label === "Card" ? "card search" : "second card search"}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {slot.state === "error" && (
        <p className="lookup__note lookup__note--strong">
          {slot.reason === "notfound"
            ? `No card called "${slot.name}".`
            : slot.reason === "offline"
              ? offlineText
              : failedText}
        </p>
      )}
      {error && <p className="lookup__note lookup__note--strong">{error}</p>}
      {hints.length > 0 && (
        <ul className="lookup__list lookup__list--hints">
          {hints.map((h) => (
            <li key={h}>
              <button className="lookup__item" onClick={() => pick(h)}>
                <span>{h}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const offlineText = "Card lookup needs internet. Keywords still work offline.";
const failedText = "Couldn't reach Scryfall. Try again in a moment.";

function CardDetails({ data, glossary }: { data: Loaded; glossary: Glossary }) {
  const { card, rulings } = data;
  const [kw, setKw] = useState<string | null>(null);
  const known = card.keywords
    .map((name) => glossary.keywords.find((k) => norm(k.name) === norm(name)))
    .filter((k): k is Keyword => !!k);

  return (
    <section className="lookup__section card">
      <h3>{card.name}</h3>
      <div className="card__body">
        {card.image && <img className="card__img" src={card.image} alt="" loading="lazy" />}
        <div className="card__text">
          {card.faces.map((f) => (
            <div key={f.name} className="card__face">
              {card.faces.length > 1 && <b>{f.name}</b>}
              <em>
                {f.typeLine} {f.manaCost}
              </em>
              {f.oracleText.split("\n").map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          ))}
        </div>
      </div>

      {known.length > 0 && (
        <div className="card__kws">
          {known.map((k) => (
            <button
              key={k.name}
              className={`chip${kw === k.name ? " is-on" : ""}`}
              onClick={() => setKw(kw === k.name ? null : k.name)}
            >
              {k.name}
            </button>
          ))}
        </div>
      )}
      {kw && <KeywordCard entry={{ type: "keyword", name: kw, k: known.find((k) => k.name === kw)! }} compact />}

      <h4 className="card__rh">
        Rulings <em>({rulings.length})</em>
      </h4>
      {rulings.length === 0 ? (
        <p className="lookup__note">No rulings for this card.</p>
      ) : (
        <ul className="rulings">
          {rulings.map((r, i) => (
            <li key={i} className="ruling">
              <RulingText r={r} />
            </li>
          ))}
        </ul>
      )}
      <a className="lookup__source" href={card.scryfallUri} target="_blank" rel="noreferrer">
        Rulings from Gatherer via Scryfall ↗
      </a>
    </section>
  );
}

function RulingText({ r }: { r: Ruling }) {
  return (
    <>
      <p className="ruling__text">{r.text}</p>
      <span className="ruling__meta">
        {r.source === "wotc" ? "Official ruling" : "Scryfall note"} · {r.date}
      </span>
    </>
  );
}

/** Rules for the concepts both cards share, straight from the CR. */
function SharedRules({
  a,
  b,
  glossary,
  vocab,
}: {
  a: Card;
  b: Card;
  glossary: Glossary;
  vocab: string[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const ca = conceptsOf(a, vocab);
  const cb = new Set(conceptsOf(b, vocab).map(norm));
  const shared = ca.filter((c) => cb.has(norm(c)));
  const entries = shared
    .map<Entry | null>((name) => {
      const k = glossary.keywords.find((x) => norm(x.name) === norm(name));
      if (k) return { type: "keyword", name: k.name, k };
      const t = glossary.terms.find((x) => x.name.split(/[(),]/).some((p) => norm(p) === norm(name)));
      return t ? { type: "term", name, summary: t.summary } : null;
    })
    .filter((e): e is Entry => !!e);
  if (entries.length === 0) return null;
  return (
    <>
      <h4 className="card__rh">Rules both cards use</h4>
      <div className="card__kws">
        {entries.map((e) => (
          <button
            key={e.name}
            className={`chip${open === e.name ? " is-on" : ""}`}
            onClick={() => setOpen(open === e.name ? null : e.name)}
          >
            {e.name}
          </button>
        ))}
      </div>
      {open && <KeywordCard entry={entries.find((e) => e.name === open)!} compact />}
    </>
  );
}
