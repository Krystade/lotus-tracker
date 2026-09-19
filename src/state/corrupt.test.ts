import { describe, expect, it } from "vitest";
import { sanitizeBests, sanitizeCounters, sanitizeSettings } from "./sanitize";
import { DEFAULT_SETTINGS } from "./types";

// A persisted value that is MISSING falls back to a default already. These
// cover the sharper case: a key that is PRESENT but the wrong type, which
// overwrites the default and then reaches code that assumes the type.

describe("sanitizeCounters", () => {
  it("replaces a non-array custom list", () => {
    expect(sanitizeCounters({ custom: "not-an-array" }).custom).toEqual([]);
  });

  it.each([null, undefined, 42, {}, "x"])("survives custom = %s", (v) => {
    expect(Array.isArray(sanitizeCounters({ custom: v }).custom)).toBe(true);
  });

  it("drops custom entries that are not objects", () => {
    const c = sanitizeCounters({ custom: [null, 7, "x", { id: "a", name: "Ok", value: 2 }] });
    expect(c.custom).toHaveLength(1);
    expect(c.custom[0]).toEqual({ id: "a", name: "Ok", value: 2 });
  });

  it("coerces a non-string counter name", () => {
    const c = sanitizeCounters({ custom: [{ id: "a", name: 123, value: 1 }] });
    expect(typeof c.custom[0].name).toBe("string");
  });

  it("coerces a non-finite counter value", () => {
    const c = sanitizeCounters({ custom: [{ id: "a", name: "n", value: "nope" }] });
    expect(Number.isFinite(c.custom[0].value)).toBe(true);
  });

  it.each(["tax", "poison", "energy"] as const)("coerces a bad %s", (k) => {
    expect(Number.isFinite(sanitizeCounters({ [k]: null })[k])).toBe(true);
    expect(Number.isFinite(sanitizeCounters({ [k]: "x" })[k])).toBe(true);
  });

  it("keeps good data untouched", () => {
    const good = { tax: 3, poison: 2, energy: 0, experience: 0, storm: 0, charge: 0,
                   custom: [{ id: "a", name: "Rad", value: 4 }] };
    expect(sanitizeCounters(good)).toEqual(good);
  });
});

describe("sanitizeSettings", () => {
  // These four are read with .toFixed() in the Settings panel, which throws on
  // null and on a string -- crashing the whole app when the panel opens.
  it.each(["effectStrength", "turnTimerScale", "lookSpeed", "defaultTurnBudgetSec"] as const)(
    "coerces a null %s to a finite number",
    (k) => {
      const s = sanitizeSettings({ ...DEFAULT_SETTINGS, [k]: null });
      expect(Number.isFinite(s[k])).toBe(true);
      expect(() => (s[k] as number).toFixed(1)).not.toThrow();
    },
  );

  it.each(["effectStrength", "turnTimerScale", "lookSpeed"] as const)(
    "coerces a string %s",
    (k) => {
      const s = sanitizeSettings({ ...DEFAULT_SETTINGS, [k]: "bogus" });
      expect(Number.isFinite(s[k])).toBe(true);
    },
  );

  it("coerces NaN and Infinity", () => {
    expect(Number.isFinite(sanitizeSettings({ ...DEFAULT_SETTINGS, lookSpeed: NaN }).lookSpeed)).toBe(true);
    expect(Number.isFinite(sanitizeSettings({ ...DEFAULT_SETTINGS, lookSpeed: Infinity }).lookSpeed)).toBe(true);
  });

  it("coerces a non-boolean toggle", () => {
    expect(typeof sanitizeSettings({ ...DEFAULT_SETTINGS, effectsOn: "yes" }).effectsOn).toBe("boolean");
  });

  it("keeps good settings untouched", () => {
    expect(sanitizeSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("sanitizeBests", () => {
  it("keeps finite numbers", () => {
    expect(sanitizeBests({ match: 9, chant: 4 })).toEqual({ match: 9, chant: 4 });
  });

  it.each([null, undefined, 7, "x", [1, 2]])("returns {} for %s", (v) => {
    expect(sanitizeBests(v)).toEqual({});
  });

  it("drops entries that are not finite numbers, keeping the rest", () => {
    expect(
      sanitizeBests({
        match: 9,
        chant: "12",
        draw: NaN,
        a: Infinity,
        b: null,
        c: { v: 1 },
      }),
    ).toEqual({ match: 9 });
  });
});

describe("arcade rotation", () => {
  it.each([0, 90, 180, 270])("accepts the quarter turn %s", (r) => {
    expect(sanitizeSettings({ arcadeRotation: r }).arcadeRotation).toBe(r);
  });

  it.each([45, -90, 360, "90", null, NaN])(
    "falls back to 0 for %s, which no control could straighten",
    (r) => {
      expect(sanitizeSettings({ arcadeRotation: r }).arcadeRotation).toBe(0);
    },
  );
});
