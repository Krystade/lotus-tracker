import type { LayoutConfig } from "../state/types";

/**
 * A layout is only usable if it places every seat exactly once.
 *
 * A missing placement starves that seat of turns; a duplicate placement used
 * to pin the turn on it permanently. `nextActivePlayerId` is hardened against
 * both, but a layout that cannot describe the table should be rejected here
 * rather than merely tolerated downstream.
 */
export function layoutCoversSeats(
  layout: LayoutConfig | undefined | null,
  playerIds: string[],
): boolean {
  if (!layout || !Array.isArray(layout.placements)) return false;
  if (layout.placements.length !== playerIds.length) return false;
  const placed = new Set(layout.placements.map((p) => p.playerId));
  if (placed.size !== playerIds.length) return false; // a seat placed twice
  return playerIds.every((id) => placed.has(id));
}
