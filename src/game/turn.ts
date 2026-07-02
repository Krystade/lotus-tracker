import type { Player, TurnState } from "../state/types";

/**
 * Returns the id of the next player after `currentId` in seating order,
 * skipping eliminated players. Wraps around. If everyone else is eliminated,
 * returns the current player. Order follows the `players` array.
 */
export function nextActivePlayerId(
  players: Player[],
  currentId: string,
): string {
  if (players.length === 0) return currentId;
  const idx = players.findIndex((p) => p.id === currentId);
  const start = idx === -1 ? 0 : idx;
  for (let step = 1; step <= players.length; step++) {
    const candidate = players[(start + step) % players.length];
    if (!candidate.eliminated) return candidate.id;
  }
  return currentId;
}

/**
 * Advance to the next player's turn: pick the next active seat, bump the turn
 * counter, and reset their countdown to the full budget.
 */
export function advanceTurn(
  turn: TurnState,
  players: Player[],
  budgetSec: number,
): TurnState {
  const activePlayerId = nextActivePlayerId(players, turn.activePlayerId);
  return {
    activePlayerId,
    turnNumber: turn.turnNumber + 1,
    budgetSec,
    remainingSec: budgetSec,
    running: true,
    expired: false,
  };
}

/**
 * Apply one tick of elapsed seconds to the active countdown. Stops at 0 and
 * flags expiry (no auto-advance). Returns an unchanged turn if not running.
 */
export function tickTurn(turn: TurnState, deltaSec: number): TurnState {
  if (!turn.running) return turn;
  const remainingSec = Math.max(0, turn.remainingSec - deltaSec);
  const expired = remainingSec <= 0;
  return {
    ...turn,
    remainingSec,
    running: expired ? false : turn.running,
    expired: expired || turn.expired,
  };
}
