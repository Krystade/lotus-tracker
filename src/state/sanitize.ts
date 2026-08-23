import { DEFAULT_SETTINGS } from "./types";
import type { CounterSet, CustomCounter, Settings } from "./types";

/**
 * Repairs persisted state whose values are the WRONG TYPE.
 *
 * The persist merge already fills in keys that are missing, which is why saves
 * from before a feature existed keep working. The sharper case is a key that is
 * present but wrong: it overwrites the default, and then reaches code that
 * assumes the type. Two real examples, both of which blank the entire app --
 * React unmounts the tree on an uncaught render error:
 *
 *   counters.custom as a string -> CounterChips calls .filter() on it, and the
 *   board crashes the instant it renders, before the user can touch anything.
 *
 *   settings.effectStrength as null -> SettingsPanel calls .toFixed() on it and
 *   crashes when the panel opens, mid-game. That one is unrecoverable in-app:
 *   the only way to change the bad value is the panel that will not open.
 *
 * Storage can hold a wrong type from an interrupted write, a quota failure
 * partway through, hand-editing, or a future release narrowing a field. None of
 * those are exotic on a phone.
 */

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === "boolean" ? v : fallback;

function sanitizeCustom(v: unknown): CustomCounter[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c, i) => ({
      id: typeof c.id === "string" ? c.id : `c${i}`,
      name: typeof c.name === "string" ? c.name : String(c.name ?? ""),
      value: num(c.value, 0),
    }));
}

export function sanitizeCounters(v: unknown): CounterSet {
  const c = (v ?? {}) as Record<string, unknown>;
  return {
    tax: num(c.tax, 0),
    poison: num(c.poison, 0),
    energy: num(c.energy, 0),
    experience: num(c.experience, 0),
    storm: num(c.storm, 0),
    charge: num(c.charge, 0),
    custom: sanitizeCustom(c.custom),
  };
}

export function sanitizeSettings(v: unknown, defaults?: Settings): Settings {
  const s = (v ?? {}) as Record<string, unknown>;
  // Fall back to the shipped defaults, never to the value being repaired --
  // using `s` as its own fallback would let a bad value validate itself.
  const d = defaults ?? DEFAULT_SETTINGS;
  return {
    ...(s as unknown as Settings),
    // Every numeric field a component formats or does arithmetic on.
    defaultTurnBudgetSec: num(s.defaultTurnBudgetSec, d.defaultTurnBudgetSec),
    turnTimerScale: num(s.turnTimerScale, d.turnTimerScale),
    lookSpeed: num(s.lookSpeed, d.lookSpeed),
    effectStrength: num(s.effectStrength, d.effectStrength),
    soundOn: bool(s.soundOn, d.soundOn),
    vibrateOn: bool(s.vibrateOn, d.vibrateOn),
    keepAwake: bool(s.keepAwake, d.keepAwake),
    turnTimerEnabled: bool(s.turnTimerEnabled, d.turnTimerEnabled),
    effectsOn: bool(s.effectsOn, d.effectsOn),
    animateLooks: bool(s.animateLooks, d.animateLooks),
  };
}
