import { describe, expect, it } from "vitest";
import { conceptsOf, crossRulings, mentions, namesOf, rulesVocabulary } from "./interaction";
import glossary from "../data/rules-glossary.json";
import type { Card, Ruling } from "../util/scryfall";

const card = (name: string, text: string, keywords: string[] = [], faces?: string[]): Card => ({
  id: name,
  name,
  faces: (faces ?? [name]).map((n) => ({ name: n, manaCost: "", typeLine: "", oracleText: text })),
  keywords,
  scryfallUri: "",
});
const r = (text: string): Ruling => ({ source: "wotc", date: "2020-01-01", text });
const vocab = rulesVocabulary(glossary);

describe("mentions", () => {
  it("matches inflections, whole words only", () => {
    expect(mentions("it was destroyed", "Destroy")).toBe(true);
    expect(mentions("you sacrificed it", "Sacrifice")).toBe(true);
    expect(mentions("indestructible", "Destroy")).toBe(false);
    expect(mentions("Flashback works", "Flash")).toBe(false);
  });
});

describe("namesOf", () => {
  it("includes each face and the short name of a legend", () => {
    expect(namesOf(card("Kogla, the Titan Ape", ""))).toContain("Kogla");
    expect(namesOf(card("Delver of Secrets // Insectile Aberration", "", [], ["Delver of Secrets", "Insectile Aberration"]))).toEqual(
      expect.arrayContaining(["Delver of Secrets", "Insectile Aberration"]),
    );
  });
});

describe("conceptsOf", () => {
  it("takes printed keywords and rules words from the text, not everyday ones", () => {
    const c = conceptsOf(card("Beast", "Deathtouch. When this enters, destroy target creature. Cast spells.", ["Deathtouch"]), vocab);
    expect(c).toEqual(expect.arrayContaining(["Deathtouch", "Destroy"]));
    expect(c).not.toContain("Cast");
  });
});

describe("crossRulings", () => {
  const humility = card("Humility", "All creatures lose all abilities and have base power and toughness 1/1.");
  const opal = card("Opalescence", "Each other non-Aura enchantment is a creature in addition to its other types.");
  const beast = card("Questing Beast", "Deathtouch", ["Deathtouch"]);
  const colossus = card("Darksteel Colossus", "Indestructible", ["Indestructible"]);

  it("puts rulings that name the other card first, and shows a shared ruling once", () => {
    const shared = r("This is the current interaction between Humility and Opalescence.");
    const out = crossRulings(
      { card: humility, rulings: [r("Humility affects itself."), shared] },
      { card: opal, rulings: [shared, r("Opalescence affects only enchantments.")] },
      vocab,
    );
    expect(out[0]).toMatchObject({ byName: true, ruling: shared });
    expect(out.filter((c) => c.ruling.text === shared.text)).toHaveLength(1);
  });

  it("links a ruling about a keyword the other card has", () => {
    const out = crossRulings(
      { card: beast, rulings: [r("Questing Beast's last ability can target a planeswalker.")] },
      { card: colossus, rulings: [r("Damage from a source with deathtouch won't destroy a creature with indestructible.")] },
      vocab,
    );
    expect(out).toEqual([expect.objectContaining({ owner: "b", because: ["Deathtouch"], byName: false })]);
  });

  it("ranks a printed-keyword match above a general rules-term match", () => {
    const out = crossRulings(
      { card: card("Questing Beast", "Deathtouch. Combat damage can't be prevented.", ["Deathtouch"]), rulings: [] },
      {
        card: colossus,
        rulings: [
          r("Combat damage dealt to it is dealt as normal."),
          r("Damage from a source with deathtouch won't destroy a creature with indestructible."),
        ],
      },
      vocab,
    );
    expect(out[0].because).toContain("Deathtouch");
  });

  it("finds nothing between unrelated cards", () => {
    const out = crossRulings(
      { card: card("Llanowar Elves", "{T}: Add {G}."), rulings: [r("It's a mana ability.")] },
      { card: card("Shock", "Shock deals 2 damage to any target."), rulings: [r("Shock can target you.")] },
      vocab,
    );
    expect(out).toEqual([]);
  });
});

describe("rules glossary data", () => {
  it("has the keywords people ask about, in the official words", () => {
    const find = (n: string) => glossary.keywords.find((k) => k.name === n);
    expect(find("Deathtouch")?.rule).toBe("702.2");
    expect(find("Trample")?.rules.length).toBeGreaterThan(2);
    expect(find("Scry")?.kind).toBe("action");
    expect(glossary.terms.find((t) => t.name === "Dies")?.summary).toMatch(/graveyard from the battlefield/);
    expect(glossary.effective).toMatch(/\d{4}/);
  });
});
