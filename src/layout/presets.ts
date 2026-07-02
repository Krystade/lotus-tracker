import type { LayoutConfig, Placement, Rotation } from "../state/types";

export function playerId(seat: number): string {
  return `p${seat}`;
}

function place(
  seat: number,
  row: number,
  col: number,
  rotation: Rotation,
  rowSpan = 1,
  colSpan = 1,
): Placement {
  return { playerId: playerId(seat), row, col, rowSpan, colSpan, rotation };
}

/**
 * Built-in arrangements for 1..6 players. Tiles are pre-rotated so each faces
 * outward from the center of a phone lying flat on the table.
 */
const BUILT_INS: Record<number, Omit<LayoutConfig, "id" | "name" | "builtIn">> =
  {
    1: {
      playerCount: 1,
      rows: 1,
      cols: 1,
      placements: [place(0, 1, 1, 0)],
    },
    2: {
      playerCount: 2,
      rows: 2,
      cols: 1,
      placements: [place(0, 1, 1, 180), place(1, 2, 1, 0)],
    },
    3: {
      playerCount: 3,
      rows: 2,
      cols: 2,
      placements: [
        place(0, 1, 1, 90),
        place(1, 1, 2, 270),
        place(2, 2, 1, 0, 1, 2),
      ],
    },
    4: {
      playerCount: 4,
      rows: 2,
      cols: 2,
      placements: [
        place(0, 1, 1, 90),
        place(1, 1, 2, 270),
        place(2, 2, 1, 90),
        place(3, 2, 2, 270),
      ],
    },
    5: {
      playerCount: 5,
      rows: 3,
      cols: 2,
      placements: [
        place(0, 1, 1, 90),
        place(1, 1, 2, 270),
        place(2, 2, 1, 90),
        place(3, 2, 2, 270),
        place(4, 3, 1, 0, 1, 2),
      ],
    },
    6: {
      playerCount: 6,
      rows: 3,
      cols: 2,
      placements: [
        place(0, 1, 1, 90),
        place(1, 1, 2, 270),
        place(2, 2, 1, 90),
        place(3, 2, 2, 270),
        place(4, 3, 1, 90),
        place(5, 3, 2, 270),
      ],
    },
  };

export function defaultLayoutFor(playerCount: number): LayoutConfig {
  const base = BUILT_INS[playerCount] ?? BUILT_INS[4];
  return {
    id: `builtin-${base.playerCount}`,
    name: `${base.playerCount} players`,
    builtIn: true,
    ...structuredCloneLayout(base),
  };
}

export function allBuiltInPresets(): LayoutConfig[] {
  return Object.keys(BUILT_INS)
    .map(Number)
    .sort((a, b) => a - b)
    .map((count) => defaultLayoutFor(count));
}

/** Deep-clone the mutable parts of a layout base. */
function structuredCloneLayout(
  base: Omit<LayoutConfig, "id" | "name" | "builtIn">,
): Omit<LayoutConfig, "id" | "name" | "builtIn"> {
  return {
    playerCount: base.playerCount,
    rows: base.rows,
    cols: base.cols,
    placements: base.placements.map((p) => ({ ...p })),
  };
}
