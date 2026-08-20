import { describe, expect, it } from "vitest";
import {
  HUES,
  LOOK_STYLES,
  allLookIds,
  lookId,
  resolveLook,
} from "./looks";
import { contrastRatio, textOn } from "./colors";

describe("look catalogue", () => {
  it("offers every style in every hue", () => {
    expect(allLookIds()).toHaveLength(HUES.length * LOOK_STYLES.length);
  });

  it("has unique hue ids and unique style ids", () => {
    expect(new Set(HUES.map((h) => h.id)).size).toBe(HUES.length);
    expect(new Set(LOOK_STYLES.map((s) => s.id)).size).toBe(LOOK_STYLES.length);
  });

  it("keeps solid as the first style so it stays the default", () => {
    expect(LOOK_STYLES[0].id).toBe("solid");
  });

  it("builds ids as hue for solid and hue-style otherwise", () => {
    expect(lookId("blue", "solid")).toBe("blue");
    expect(lookId("blue", "lava")).toBe("blue-lava");
  });
});

describe("resolveLook — parsing", () => {
  it("resolves a bare hue to that hue in solid", () => {
    const l = resolveLook("blue", "#000");
    expect(l.hueId).toBe("blue");
    expect(l.styleId).toBe("solid");
  });

  it("resolves a hue-style id", () => {
    const l = resolveLook("magenta-lava", "#000");
    expect(l.hueId).toBe("magenta");
    expect(l.styleId).toBe("lava");
  });

  // These three ids are what every already-saved player and profile holds.
  it.each(["gold", "blue-fade", "green-stripe"])(
    "still resolves the legacy id %s",
    (id) => {
      const l = resolveLook(id, "#000");
      expect(l.id).toBe(id);
      expect(l.base).not.toBe("#000");
    },
  );

  it("resolves legacy ids to the same base colour they always had", () => {
    expect(resolveLook("blue-fade", "#000").base).toBe(
      resolveLook("blue", "#000").base,
    );
  });
});

describe("resolveLook — fallback", () => {
  it.each([undefined, "", "chartreuse", "blue-tartan", "-", "gold-"])(
    "falls back to the player's colour for %s",
    (id) => {
      const l = resolveLook(id as string | undefined, "#123456");
      expect(l.base).toBe("#123456");
      expect(l.animated).toBe(false);
    },
  );

  it("does not animate the fallback look", () => {
    expect(resolveLook("nope", "#123456").layers).toBe(0);
  });
});

describe("resolveLook — shape", () => {
  it("supplies the custom properties a style needs", () => {
    const l = resolveLook("blue-nebula", "#000");
    expect(Object.keys(l.vars)).toEqual(
      expect.arrayContaining(["--look-base", "--look-lo", "--look-hi"]),
    );
  });

  it("reports how many layers the style renders", () => {
    expect(resolveLook("blue", "#000").layers).toBe(0);
    expect(resolveLook("blue-drift", "#000").layers).toBe(2);
    expect(resolveLook("blue-lava", "#000").layers).toBe(3);
  });

  it("flags which styles animate", () => {
    expect(resolveLook("blue", "#000").animated).toBe(false);
    expect(resolveLook("blue-fade", "#000").animated).toBe(false);
    expect(resolveLook("blue-lava", "#000").animated).toBe(true);
  });
});

describe("the contrast guarantee", () => {
  // The life total is enormous, so WCAG's large-text minimum of 3:1 is the
  // right bar. This iterates the catalogue rather than a fixed list, so a
  // style added later is covered without anyone remembering to add it here.
  it.each(allLookIds())("keeps the life total legible on %s", (id) => {
    const look = resolveLook(id, "#000");
    const ink = textOn(look.base);
    for (const colour of look.paintedColours) {
      expect(contrastRatio(ink, colour)).toBeGreaterThanOrEqual(3);
    }
  });

  it("actually discriminates — a light grey on white fails the same bar", () => {
    expect(contrastRatio("#ffffff", "#b0b0b0")).toBeLessThan(3);
    expect(contrastRatio("#ffffff", "#000000")).toBeGreaterThan(20);
  });
});

describe("the fallback palette", () => {
  // The fallback is not in allLookIds(), so the catalogue sweep above never
  // sees it. It once derived its own colours and skipped the contrast clamp.
  it.each(["#123456", "#E4B33D", "#ffffff", "#000000"])(
    "keeps its derived colours legible for %s",
    (colour) => {
      const look = resolveLook("not-a-real-look", colour);
      const ink = textOn(look.base);
      for (const v of ["--look-lo", "--look-hi"]) {
        expect(contrastRatio(ink, look.vars[v])).toBeGreaterThanOrEqual(3);
      }
    },
  );
});

describe("look ids — custom and multi colour", () => {
  // Ids split at the LAST dash, because a style id never contains one but a
  // hex colour spec might sit to its left.
  it("accepts a custom hex colour", () => {
    const l = resolveLook("#aabbcc-lava", "#000");
    expect(l.styleId).toBe("lava");
    expect(l.base.toLowerCase()).toBe("#aabbcc");
  });

  it("accepts a custom hex colour with no style", () => {
    const l = resolveLook("#aabbcc", "#000");
    expect(l.styleId).toBe("solid");
    expect(l.base.toLowerCase()).toBe("#aabbcc");
  });

  it("accepts two named hues", () => {
    const l = resolveLook("blue~green-lava", "#000");
    expect(l.colourSpec).toEqual(["blue", "green"]);
    expect(l.styleId).toBe("lava");
  });

  it("accepts two custom colours", () => {
    const l = resolveLook("#aabbcc~#ddeeff-nebula", "#000");
    expect(l.colourSpec).toEqual(["#aabbcc", "#ddeeff"]);
    expect(l.base.toLowerCase()).toBe("#aabbcc");
  });

  it("mixes a named hue with a custom colour", () => {
    const l = resolveLook("blue~#ff8800-tide", "#000");
    expect(l.styleId).toBe("tide");
    expect(l.colourSpec).toEqual(["blue", "#ff8800"]);
  });

  it("takes its contrast anchor from the first colour", () => {
    const a = resolveLook("blue~green-lava", "#000");
    const b = resolveLook("blue-lava", "#000");
    expect(a.base).toBe(b.base);
  });

  it("builds round-trippable ids", () => {
    for (const id of ["blue", "blue-lava", "#aabbcc-lava", "blue~green-lava"]) {
      const l = resolveLook(id, "#000");
      expect(lookId(l.colourSpec.join("~"), l.styleId)).toBe(id);
    }
  });

  it("rejects a malformed hex and falls back", () => {
    expect(resolveLook("#zzz-lava", "#123456").base).toBe("#123456");
  });

  it("keeps legacy ids working alongside the new grammar", () => {
    expect(resolveLook("blue-fade", "#000").styleId).toBe("fade");
    expect(resolveLook("gold", "#000").styleId).toBe("solid");
  });
});

describe("the contrast guarantee for custom colours", () => {
  // A colour wheel means any colour at all, so the clamp has to hold for
  // colours nobody vetted.
  it.each(["#ffffff", "#000000", "#ff0000", "#00ff88", "#7a7a7a", "#123456"])(
    "keeps the life total legible on custom %s",
    (colour) => {
      const look = resolveLook(`${colour}-lava`, "#000");
      const ink = textOn(look.base);
      for (const v of ["--look-lo", "--look-hi"]) {
        expect(contrastRatio(ink, look.vars[v])).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it("keeps the second colour legible too", () => {
    const look = resolveLook("#000000~#ffffff-lava", "#000");
    const ink = textOn(look.base);
    for (const c of look.paintedColours) {
      expect(contrastRatio(ink, c)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("preset normalisation", () => {
  // A seat's own colour is always one of the presets, so opening the picker
  // for a seat that has never chosen a look must light up that preset rather
  // than falling into the custom-colour wheel.
  it.each(HUES)("normalises $base back to the $id preset", (hue) => {
    const l = resolveLook(hue.base, "#000");
    expect(l.colourSpec).toEqual([hue.id]);
    expect(l.hueId).toBe(hue.id);
  });

  it("normalises case-insensitively", () => {
    expect(resolveLook("#3e92cc-lava", "#000").colourSpec).toEqual(["blue"]);
  });

  it("leaves a genuinely custom colour alone", () => {
    expect(resolveLook("#ff8800-lava", "#000").colourSpec).toEqual(["#ff8800"]);
  });
});

describe("the two-colour mix", () => {
  // A second colour used to be all-or-nothing. The mix is how much of it
  // reaches the highlight, encoded in the id as @<percent>.
  it("defaults to a full second colour when no mix is given", () => {
    expect(resolveLook("blue~green-lava", "#000").mix).toBe(1);
  });

  it("parses a mix out of the id", () => {
    const l = resolveLook("blue~green@40-lava", "#000");
    expect(l.colourSpec).toEqual(["blue", "green"]);
    expect(l.mix).toBeCloseTo(0.4);
    expect(l.styleId).toBe("lava");
  });

  it("at mix 0 renders exactly as the single-colour look", () => {
    const none = resolveLook("blue-lava", "#000");
    const zero = resolveLook("blue~green@0-lava", "#000");
    expect(zero.vars["--look-hi"]).toBe(none.vars["--look-hi"]);
    expect(zero.vars["--look-lo"]).toBe(none.vars["--look-lo"]);
  });

  it("at mix 100 renders exactly as the un-mixed two-colour look", () => {
    const full = resolveLook("blue~green-lava", "#000");
    const hundred = resolveLook("blue~green@100-lava", "#000");
    expect(hundred.vars["--look-hi"]).toBe(full.vars["--look-hi"]);
  });

  it("moves the highlight as the mix rises", () => {
    const seen = [0, 25, 50, 75, 100].map(
      (m) => resolveLook(`blue~red@${m}-lava`, "#000").vars["--look-hi"],
    );
    // Not a stuck value: the extremes must differ, and it must actually travel.
    expect(seen[0]).not.toBe(seen[4]);
    expect(new Set(seen).size).toBeGreaterThan(2);
  });

  it("ignores a mix when there is no second colour", () => {
    expect(resolveLook("blue@40-lava", "#000").mix).toBe(1);
  });

  it("rejects a malformed mix rather than guessing", () => {
    expect(resolveLook("blue~green@abc-lava", "#123456").base).toBe("#123456");
    expect(resolveLook("blue~green@140-lava", "#123456").base).toBe("#123456");
    expect(resolveLook("blue~green@-5-lava", "#123456").base).toBe("#123456");
  });

  it("round-trips an id carrying a mix", () => {
    for (const id of ["blue~green@40-lava", "blue~green-lava", "blue-lava"]) {
      const l = resolveLook(id, "#000");
      expect(lookId(l.colourSpec.join("~"), l.styleId, l.mix)).toBe(id);
    }
  });
});

describe("the contrast guarantee across the mix", () => {
  // The clamp has to hold at every position of the slider, not just its ends.
  const pairs = [
    ["#000000", "#ffffff"],
    ["#ffffff", "#000000"],
    ["#E4B33D", "#3E92CC"],
    ["#4C9A52", "#B23A6B"],
  ];
  for (const [a, b] of pairs) {
    it.each([0, 15, 40, 60, 85, 100])(
      `keeps ${a}~${b} legible at mix %i`,
      (m) => {
        const look = resolveLook(`${a}~${b}@${m}-lava`, "#000");
        const ink = textOn(look.base);
        for (const c of look.paintedColours) {
          expect(contrastRatio(ink, c)).toBeGreaterThanOrEqual(3);
        }
      },
    );
  }
});

describe("the mix stays vivid across its range", () => {
  // An earlier version of this test measured HSL saturation, which is the
  // wrong instrument: it passed #874c00 (brown, saturation 1.00) and failed a
  // perfectly good slate violet. Perceptual chroma is what separates a colour
  // from mud, so that is what is measured here.
  const chroma = (hex: string) => {
    const lin = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    const [r, g, b] = lin;
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return Math.sqrt(A * A + B * B);
  };

  it.each([
    ["blue", "red"],
    ["gold", "purple"],
    ["green", "magenta"],
    ["blue", "green"],
  ])("never collapses toward grey blending %s with %s", (a, b) => {
    const ends = [0, 100].map((m) =>
      chroma(resolveLook(`${a}~${b}@${m}-stripe`, "#000").vars["--look-lo"]),
    );
    // Chroma interpolates in a perceptual space, so the middle can dip a
    // little below the ends but must never approach neutral.
    const floor = Math.min(...ends) * 0.55;
    for (const m of [20, 35, 50, 65, 80]) {
      const c = chroma(
        resolveLook(`${a}~${b}@${m}-stripe`, "#000").vars["--look-lo"],
      );
      expect(c).toBeGreaterThanOrEqual(floor);
    }
  });

  it("discriminates — a straight RGB midpoint of blue and red does collapse", () => {
    // #786664 is where sRGB interpolation lands halfway. It is nearly neutral.
    expect(chroma("#786664")).toBeLessThan(0.03);
    expect(chroma("#3E92CC")).toBeGreaterThan(0.07);
  });
});

describe("the mix avoids the muddy band", () => {
  // Green to magenta is only marginally shorter going round via yellow, and
  // that route turns the middle of the slider olive and then brown, because
  // yellow-orange hues have no vivid dark form. It must take the blue side.
  const isMuddy = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    // Brown/olive: red leads, blue trails badly, and it is dark overall.
    return r > b + 40 && g > b + 25 && r + g + b < 420;
  };

  it("does not pass through brown blending green with magenta", () => {
    for (const m of [20, 35, 50, 65, 80]) {
      const look = resolveLook(`green~magenta@${m}-stripe`, "#000");
      expect(isMuddy(look.vars["--look-lo"])).toBe(false);
    }
  });

  it("discriminates — the colours it used to produce are caught", () => {
    expect(isMuddy("#874c00")).toBe(true); // the old 50% step
    expect(isMuddy("#695e00")).toBe(true); // the old 25% step
    expect(isMuddy("#11609c")).toBe(false); // what it produces now
  });

  it("still takes the short way when an end is itself in that band", () => {
    // Blue to gold genuinely passes through green; there is nothing to avoid
    // when the destination is the muddy band.
    const mid = resolveLook("blue~gold@50-stripe", "#000").vars["--look-lo"];
    expect(mid).not.toBe(resolveLook("blue~gold@0-stripe", "#000").vars["--look-lo"]);
  });
});
