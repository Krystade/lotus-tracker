import type { GameState, LogEntry, LogKind } from "../state/types";

/** Taps on the same thing closer together than this read as one change. */
export const MERGE_MS = 4000;
const MAX_ENTRIES = 400;

interface Change {
  kind: LogKind;
  playerId: string;
  delta: number;
  value: number;
  from?: string;
  sticker?: LogEntry["sticker"];
}

/**
 * What changed between two states of the same game, in the terms a player
 * would say it: commander damage is one hit, not a hit plus a life loss.
 */
export function diffGame(prev: GameState, next: GameState): Change[] {
  const out: Change[] = [];
  for (const p of next.players) {
    const before = prev.players.find((x) => x.id === p.id);
    if (!before) continue;

    let cmdrTotal = 0;
    for (const [from, value] of Object.entries(p.commanderDamage)) {
      const delta = value - (before.commanderDamage[from] ?? 0);
      if (delta === 0) continue;
      cmdrTotal += delta;
      out.push({ kind: "cmdr", playerId: p.id, delta, value, from });
    }
    // Life moved by commander damage is already told by the cmdr entry.
    const lifeDelta = p.life - before.life + cmdrTotal;
    if (lifeDelta !== 0) {
      out.push({ kind: "life", playerId: p.id, delta: lifeDelta, value: p.life });
    }
    const poison = p.counters.poison - before.counters.poison;
    if (poison !== 0) {
      out.push({ kind: "poison", playerId: p.id, delta: poison, value: p.counters.poison });
    }
  }
  for (const s of next.stickers) {
    const was = prev.stickers.find((x) => x.id === s.id);
    if (was?.holder === s.holder) continue;
    out.push({ kind: "sticker", playerId: s.holder, delta: 0, value: 0, from: was?.holder, sticker: s.id });
  }
  return out;
}

const sameThing = (e: LogEntry, c: Change) =>
  e.kind === c.kind && e.playerId === c.playerId && e.from === c.from && c.kind !== "sticker";

/**
 * Append the changes to the log. A change to the same thing within MERGE_MS
 * of the last edit folds into that entry -- holding minus is one "-10", not
 * ten "-1"s -- and an entry folded back to zero (a mis-tap undone) is dropped.
 */
export function appendLog(
  log: LogEntry[],
  changes: Change[],
  ctx: { turn: number; at: number; now: number },
): LogEntry[] {
  if (changes.length === 0) return log;
  let next = log.slice();
  let n = next.reduce((m, e) => Math.max(m, e.n), 0);
  for (const c of changes) {
    // Only look back over the run of recent entries, not the whole game.
    const idx = findRecent(next, c, ctx.now);
    if (idx >= 0) {
      const e = next[idx];
      const delta = e.delta + c.delta;
      if (delta === 0) {
        next.splice(idx, 1);
      } else {
        next[idx] = { ...e, delta, value: c.value, ts: ctx.now };
      }
      continue;
    }
    n += 1;
    next.push({ n, ...c, turn: ctx.turn, at: ctx.at, ts: ctx.now });
  }
  if (next.length > MAX_ENTRIES) next = next.slice(next.length - MAX_ENTRIES);
  return next;
}

function findRecent(log: LogEntry[], c: Change, now: number): number {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (now - e.ts > MERGE_MS) return -1;
    if (sameThing(e, c)) return i;
  }
  return -1;
}

export function sanitizeLog(v: unknown): LogEntry[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (e): e is LogEntry =>
      !!e &&
      typeof e === "object" &&
      typeof (e as LogEntry).n === "number" &&
      typeof (e as LogEntry).kind === "string" &&
      typeof (e as LogEntry).playerId === "string" &&
      Number.isFinite((e as LogEntry).delta) &&
      Number.isFinite((e as LogEntry).value),
  );
}
