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
