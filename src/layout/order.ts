import type { LayoutConfig } from "../state/types";

interface Seat {
  id: string;
  cx: number;
  cy: number;
  seat: number;
}

/**
 * Seating order around the table, clockwise, derived purely from where tiles
 * sit on the grid — never from the players array or the player count. That is
 * what makes custom layouts work without special-casing: a custom layout is the
 * same Placement shape the presets use.
 *
 * Two layouts with the same number of seats legitimately produce different
 * orders. If you are tempted to turn this into a lookup keyed by player count,
 * read order.test.ts first.
 */
export function clockwiseSeatOrder(layout: LayoutConfig): string[] {
  const seats: Seat[] = layout.placements.map((p) => ({
    id: p.playerId,
    // Center of the placement, so a seat spanning two cells sits at its middle.
    cx: p.col + p.colSpan / 2,
    cy: p.row + p.rowSpan / 2,
    seat: Number(p.playerId.slice(1)),
  }));

  if (seats.length <= 1) return seats.map((s) => s.id);

  // A single row has no interior to walk around, so "clockwise" is undefined
  // there. Reading order is the sane answer. (A single column needs no such
  // case: the general sweep below already yields top-to-bottom.)
  const singleRow = seats.every((s) => s.cy === seats[0].cy);
  if (singleRow) {
    return [...seats]
      .sort((a, b) => a.cx - b.cx || a.seat - b.seat)
      .map((s) => s.id);
  }

  const centroidX = seats.reduce((sum, s) => sum + s.cx, 0) / seats.length;
  const centroidY = seats.reduce((sum, s) => sum + s.cy, 0) / seats.length;

  // Screen coordinates put y downward, so an increasing atan2 angle sweeps
  // right -> down -> left -> up, which reads as clockwise on the table. Ties
  // (seats collinear with the centroid on the same side) break by seat index
  // so the result is always deterministic.
  const angle = (s: Seat) => Math.atan2(s.cy - centroidY, s.cx - centroidX);
  return [...seats]
    .sort((a, b) => angle(a) - angle(b) || a.seat - b.seat)
    .map((s) => s.id);
}
