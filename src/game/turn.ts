import type { Player, TurnState } from "../state/types";

/**
 * Returns the id of the next player after `currentId`, walking `order` —
 * the clockwise seating order derived from the layout — and skipping
 * eliminated players. Wraps around. If everyone else is eliminated, returns
 * the current player.
 *
 * `order` is the source of truth for who sits where; the players array is only
 * consulted for liveness. If the order does not describe the current seat (a
 * partial or corrupt layout), falls back to array order so a turn can always
 * be passed.
 */
export function nextActivePlayerId(
  players: Player[],
  currentId: string,
  order: string[],
): string {
  if (players.length === 0) return currentId;
  const seated = order.filter((id) => players.some((p) => p.id === id));
  const ring = seated.includes(currentId) ? seated : players.map((p) => p.id);

  const idx = ring.indexOf(currentId);
  const start = idx === -1 ? 0 : idx;
  for (let step = 1; step <= ring.length; step++) {
    const candidate = players.find(
      (p) => p.id === ring[(start + step) % ring.length],
    );
    if (candidate && !candidate.eliminated) return candidate.id;
  }
  return currentId;
}

/**
 * Advance to the next player's turn: pick the next seat clockwise, bump the
 * turn counter, and reset their countdown to the full budget. The countdown
 * only starts if the turn timer is enabled, matching setActivePlayer and
 * resetTurnTimer.
 */
export function advanceTurn(
  turn: TurnState,
  players: Player[],
  budgetSec: number,
  order: string[],
  timerEnabled: boolean,
): TurnState {
  const activePlayerId = nextActivePlayerId(players, turn.activePlayerId, order);
  return {
    activePlayerId,
    turnNumber: turn.turnNumber + 1,
    budgetSec,
    remainingSec: budgetSec,
    running: timerEnabled,
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
