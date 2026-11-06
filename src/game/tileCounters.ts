import {
  COMMANDER_DAMAGE_LETHAL,
  POISON_LETHAL,
  type CounterKey,
  type Player,
} from "../state/types";

/**
 * Abbreviated so several fit across a narrow tile; the full name is what
 * assistive tech announces.
 */
export const COUNTER_LABELS: Array<[CounterKey, short: string, full: string]> = [
  ["tax", "TAX", "commander tax"],
  ["poison", "PSN", "poison"],
  ["energy", "NRG", "energy"],
  ["experience", "EXP", "experience"],
  ["storm", "STM", "storm"],
  ["charge", "CHG", "charge"],
];

export type TileCounter =
  | { kind: "standard"; key: string; counter: CounterKey; short: string; full: string; value: number; warn: boolean }
  | { kind: "custom"; key: string; id: string; short: string; full: string; value: number; warn: false }
  | { kind: "cmdr"; key: string; from: Player; short: string; full: string; value: number; warn: boolean };

/**
 * What a tile shows: every counter above 0, and every one somebody has used
 * this game even if it is back at 0 -- so the controls stay where the table
 * expects them. Commander damage first (it is what ends games), in seat
 * order, then the standard counters, then custom ones.
 */
export function tileCounters(player: Player, players: Player[]): TileCounter[] {
  const pinned = new Set(player.pinned ?? []);
  const shows = (key: string, value: number) => value > 0 || pinned.has(key);
  const out: TileCounter[] = [];

  for (const from of players) {
    if (from.id === player.id) continue;
    const key = `cmdr:${from.id}`;
    const value = player.commanderDamage[from.id] ?? 0;
    if (!shows(key, value)) continue;
    out.push({
      kind: "cmdr",
      key,
      from,
      // The opponent's colour dot says "commander damage"; the name says whose.
      short: from.name.slice(0, 4),
      full: `commander damage from ${from.name}`,
      value,
      warn: value >= COMMANDER_DAMAGE_LETHAL,
    });
  }
  for (const [counter, short, full] of COUNTER_LABELS) {
    const value = player.counters[counter];
    if (!shows(counter, value)) continue;
    out.push({
      kind: "standard",
      key: counter,
      counter,
      short,
      full,
      value,
      warn: counter === "poison" && value >= POISON_LETHAL,
    });
  }
  for (const c of player.counters.custom) {
    const key = `custom:${c.id}`;
    if (!shows(key, c.value)) continue;
    out.push({ kind: "custom", key, id: c.id, short: c.name.slice(0, 4).toUpperCase(), full: c.name, value: c.value, warn: false });
  }
  return out;
}
