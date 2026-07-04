import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  COMMANDER_TAX_STEP,
  type CounterKey,
  type CounterSet,
  type GameState,
  type LayoutConfig,
  type Player,
  type Settings,
} from "./types";
import {
  applyLifeDelta,
  clampCounter,
  clampLife,
  clampStartingLife,
} from "../game/life";
import { advanceTurn, tickTurn } from "../game/turn";
import { colorForSeat } from "../layout/colors";
import { defaultLayoutFor } from "../layout/presets";
import { uid } from "../util/id";

// localStorage can throw in private mode / at quota. Degrade to a no-op so a
// failed write never breaks the in-memory game (which is the source of truth).
const safeStorage = {
  getItem: (name: string): string | null => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value);
    } catch {
      /* ignore quota / private-mode errors */
    }
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

const DEFAULT_SETTINGS: Settings = {
  defaultTurnBudgetSec: 300,
  turnTimerScale: 1,
  soundOn: true,
  vibrateOn: true,
  keepAwake: true,
  turnTimerEnabled: true,
};

function emptyCounters(): CounterSet {
  return {
    tax: 0,
    poison: 0,
    energy: 0,
    experience: 0,
    storm: 0,
    charge: 0,
    custom: [],
  };
}

function createPlayer(seat: number, startingLife: number): Player {
  return {
    id: `p${seat}`,
    name: `P${seat + 1}`,
    color: colorForSeat(seat),
    life: startingLife,
    counters: emptyCounters(),
    commanderDamage: {},
    eliminated: false,
  };
}

function createPlayers(count: number, startingLife: number): Player[] {
  return Array.from({ length: count }, (_, i) => createPlayer(i, startingLife));
}

function reconcilePlayers(
  existing: Player[],
  count: number,
  startingLife: number,
): Player[] {
  const validIds = new Set(
    Array.from({ length: count }, (_, i) => `p${i}`),
  );
  const next: Player[] = [];
  for (let i = 0; i < count; i++) {
    const p = existing[i] ?? createPlayer(i, startingLife);
    // Drop commander damage from opponents who no longer exist, else their
    // stale (possibly lethal) value would haunt the player unclearable.
    const commanderDamage: Record<string, number> = {};
    for (const [k, v] of Object.entries(p.commanderDamage)) {
      if (validIds.has(k) && k !== p.id) commanderDamage[k] = v;
    }
    next.push({ ...p, commanderDamage });
  }
  return next;
}

function newGameState(
  playerCount: number,
  startingLife: number,
  settings: Settings,
  layout?: LayoutConfig,
): GameState {
  const count = Math.max(1, Math.min(6, Math.round(playerCount) || 4));
  const life = clampStartingLife(startingLife);
  const players = createPlayers(count, life);
  const budget = settings.defaultTurnBudgetSec;
  return {
    players,
    startingLife: life,
    layout: layout ?? defaultLayoutFor(count),
    turn: {
      activePlayerId: players[0].id,
      turnNumber: 1,
      budgetSec: budget,
      remainingSec: budget,
      running: settings.turnTimerEnabled,
      expired: false,
    },
    gameElapsedSec: 0,
    gameTimerRunning: true,
  };
}

export interface StoreState {
  game: GameState;
  settings: Settings;
  customLayouts: LayoutConfig[];

  // lifecycle
  newGame: (opts: {
    playerCount: number;
    startingLife: number;
    layout?: LayoutConfig;
  }) => void;
  resetLife: () => void;

  // life & counters
  adjustLife: (playerId: string, delta: number) => void;
  setLife: (playerId: string, value: number) => void;
  adjustCounter: (playerId: string, key: CounterKey, delta: number) => void;
  bumpTax: (playerId: string, direction: 1 | -1) => void;
  addCustomCounter: (playerId: string, name: string) => void;
  adjustCustomCounter: (
    playerId: string,
    counterId: string,
    delta: number,
  ) => void;
  removeCustomCounter: (playerId: string, counterId: string) => void;
  adjustCommanderDamage: (
    playerId: string,
    fromId: string,
    delta: number,
  ) => void;
  toggleEliminated: (playerId: string) => void;
  setTimerPos: (playerId: string, pos: { x: number; y: number }) => void;
  setPlayerName: (playerId: string, name: string) => void;
  setFirstPlayer: (playerId: string) => void;

  // turns & timers
  passTurn: () => void;
  setActivePlayer: (playerId: string) => void;
  toggleTurnRunning: () => void;
  resetTurnTimer: () => void;
  toggleGameTimer: () => void;
  tick: (deltaSec: number) => void;

  // layout
  applyLayout: (layout: LayoutConfig) => void;
  saveCustomLayout: (name: string) => void;
  deleteCustomLayout: (id: string) => void;

  // settings
  updateSettings: (patch: Partial<Settings>) => void;
}

function updatePlayer(
  players: Player[],
  playerId: string,
  fn: (p: Player) => Player,
): Player[] {
  return players.map((p) => (p.id === playerId ? fn(p) : p));
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      game: newGameState(4, 40, DEFAULT_SETTINGS),
      settings: DEFAULT_SETTINGS,
      customLayouts: [],

      newGame: ({ playerCount, startingLife, layout }) =>
        set((s) => {
          // Keep the current (possibly custom) arrangement if the pod size is
          // unchanged, instead of always snapping back to the default preset.
          const keep =
            layout ??
            (s.game.layout.playerCount === playerCount
              ? s.game.layout
              : undefined);
          return {
            game: newGameState(playerCount, startingLife, s.settings, keep),
          };
        }),

      resetLife: () =>
        set((s) => {
          const players = s.game.players.map((p) => ({
            ...p,
            life: s.game.startingLife,
            counters: emptyCounters(),
            commanderDamage: {},
            eliminated: false,
          }));
          const budget = s.settings.defaultTurnBudgetSec;
          return {
            game: {
              ...s.game,
              players,
              turn: {
                activePlayerId: players[0].id,
                turnNumber: 1,
                budgetSec: budget,
                remainingSec: budget,
                running: s.settings.turnTimerEnabled,
                expired: false,
              },
              gameElapsedSec: 0,
              gameTimerRunning: true,
            },
          };
        }),

      adjustLife: (playerId, delta) =>
        set((s) => ({
          game: {
            ...s.game,
            players: updatePlayer(s.game.players, playerId, (p) => ({
              ...p,
              life: applyLifeDelta(p.life, delta),
            })),
          },
        })),

      setLife: (playerId, value) => {
        if (!Number.isFinite(value)) return; // ignore NaN / bad input
        set((s) => ({
          game: {
            ...s.game,
            players: updatePlayer(s.game.players, playerId, (p) => ({
              ...p,
              life: clampLife(Math.round(value)),
            })),
          },
        }));
      },

      adjustCounter: (playerId, key, delta) =>
        set((s) => ({
          game: {
            ...s.game,
            players: updatePlayer(s.game.players, playerId, (p) => ({
              ...p,
              counters: {
                ...p.counters,
                [key]: clampCounter(p.counters[key] + delta),
              },
            })),
          },
        })),

      bumpTax: (playerId, direction) =>
        set((s) => ({
          game: {
            ...s.game,
            players: updatePlayer(s.game.players, playerId, (p) => ({
              ...p,
              counters: {
                ...p.counters,
                tax: clampCounter(
                  p.counters.tax + direction * COMMANDER_TAX_STEP,
                ),
              },
            })),
          },
        })),

      addCustomCounter: (playerId, name) =>
        set((s) => ({
          game: {
            ...s.game,
            players: updatePlayer(s.game.players, playerId, (p) => ({
              ...p,
              counters: {
                ...p.counters,
                custom: [
                  ...p.counters.custom,
                  { id: uid(), name: name || "Counter", value: 0 },
                ],
              },
            })),
          },
        })),

      adjustCustomCounter: (playerId, counterId, delta) =>
        set((s) => ({
          game: {
            ...s.game,
            players: updatePlayer(s.game.players, playerId, (p) => ({
              ...p,
              counters: {
                ...p.counters,
                custom: p.counters.custom.map((c) =>
                  c.id === counterId
                    ? { ...c, value: clampCounter(c.value + delta) }
                    : c,
                ),
              },
            })),
          },
        })),

      removeCustomCounter: (playerId, counterId) =>
        set((s) => ({
          game: {
            ...s.game,
            players: updatePlayer(s.game.players, playerId, (p) => ({
              ...p,
              counters: {
                ...p.counters,
                custom: p.counters.custom.filter((c) => c.id !== counterId),
              },
            })),
          },
        })),

      // Taking commander damage also reduces life by the same amount.
      adjustCommanderDamage: (playerId, fromId, delta) =>
        set((s) => ({
          game: {
            ...s.game,
            players: updatePlayer(s.game.players, playerId, (p) => {
              const current = p.commanderDamage[fromId] ?? 0;
              const nextVal = clampCounter(current + delta);
              const appliedDelta = nextVal - current;
              return {
                ...p,
                commanderDamage: { ...p.commanderDamage, [fromId]: nextVal },
                life: applyLifeDelta(p.life, -appliedDelta),
              };
            }),
          },
        })),

      toggleEliminated: (playerId) =>
        set((s) => {
          const players = updatePlayer(s.game.players, playerId, (p) => ({
            ...p,
            eliminated: !p.eliminated,
          }));
          const toggled = players.find((p) => p.id === playerId);
          // If we just eliminated the active player, hand off the turn.
          const turn =
            toggled?.eliminated && s.game.turn.activePlayerId === playerId
              ? advanceTurn(s.game.turn, players, s.settings.defaultTurnBudgetSec)
              : s.game.turn;
          return { game: { ...s.game, players, turn } };
        }),

      setTimerPos: (playerId, pos) =>
        set((s) => ({
          game: {
            ...s.game,
            players: updatePlayer(s.game.players, playerId, (p) => ({
              ...p,
              timerPos: pos,
            })),
          },
        })),

      setPlayerName: (playerId, name) =>
        set((s) => ({
          game: {
            ...s.game,
            players: updatePlayer(s.game.players, playerId, (p) => {
              const trimmed = name.trim().slice(0, 16);
              const seat = Number(playerId.slice(1)) + 1;
              return { ...p, name: trimmed || `P${seat}` };
            }),
          },
        })),

      // Choose who takes the first turn (used by "random first player").
      setFirstPlayer: (playerId) =>
        set((s) => {
          const target = s.game.players.find((p) => p.id === playerId);
          if (!target || target.eliminated) return {}; // ignore invalid/dead
          return {
            game: {
              ...s.game,
              turn: {
                ...s.game.turn,
                activePlayerId: playerId,
                turnNumber: 1,
                remainingSec: s.settings.defaultTurnBudgetSec,
                budgetSec: s.settings.defaultTurnBudgetSec,
                running: s.settings.turnTimerEnabled,
                expired: false,
              },
            },
          };
        }),

      passTurn: () =>
        set((s) => ({
          game: {
            ...s.game,
            turn: advanceTurn(
              s.game.turn,
              s.game.players,
              s.settings.defaultTurnBudgetSec,
            ),
          },
        })),

      setActivePlayer: (playerId) =>
        set((s) => ({
          game: {
            ...s.game,
            turn: {
              ...s.game.turn,
              activePlayerId: playerId,
              remainingSec: s.settings.defaultTurnBudgetSec,
              budgetSec: s.settings.defaultTurnBudgetSec,
              running: s.settings.turnTimerEnabled,
              expired: false,
            },
          },
        })),

      toggleTurnRunning: () =>
        set((s) => ({
          game: {
            ...s.game,
            turn: { ...s.game.turn, running: !s.game.turn.running },
          },
        })),

      resetTurnTimer: () =>
        set((s) => ({
          game: {
            ...s.game,
            turn: {
              ...s.game.turn,
              remainingSec: s.settings.defaultTurnBudgetSec,
              budgetSec: s.settings.defaultTurnBudgetSec,
              expired: false,
              running: s.settings.turnTimerEnabled,
            },
          },
        })),

      toggleGameTimer: () =>
        set((s) => ({
          game: { ...s.game, gameTimerRunning: !s.game.gameTimerRunning },
        })),

      tick: (deltaSec) =>
        set((s) => {
          const gameElapsedSec = s.game.gameTimerRunning
            ? s.game.gameElapsedSec + deltaSec
            : s.game.gameElapsedSec;
          const turn = s.settings.turnTimerEnabled
            ? tickTurn(s.game.turn, deltaSec)
            : s.game.turn;
          return { game: { ...s.game, gameElapsedSec, turn } };
        }),

      applyLayout: (layout) =>
        set((s) => {
          const players = reconcilePlayers(
            s.game.players,
            layout.playerCount,
            s.game.startingLife,
          );
          const activeExists = players.some(
            (p) => p.id === s.game.turn.activePlayerId,
          );
          return {
            game: {
              ...s.game,
              players,
              layout,
              turn: activeExists
                ? s.game.turn
                : { ...s.game.turn, activePlayerId: players[0].id },
            },
          };
        }),

      saveCustomLayout: (name) =>
        set((s) => {
          const snapshot: LayoutConfig = {
            ...s.game.layout,
            id: `custom-${uid()}`,
            name: name || "My layout",
            builtIn: false,
            placements: s.game.layout.placements.map((p) => ({ ...p })),
          };
          return {
            customLayouts: [...s.customLayouts, snapshot],
            game: { ...s.game, layout: snapshot },
          };
        }),

      deleteCustomLayout: (id) =>
        set((s) => ({
          customLayouts: s.customLayouts.filter((l) => l.id !== id),
        })),

      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
    }),
    {
      name: "lotus-tracker",
      version: 2,
      storage: createJSONStorage(() => safeStorage),
      migrate: (state) => state as StoreState,
      // Deep-fill from defaults so a persisted object from an older build (or
      // hand-edited/corrupt storage) can't leave a field `undefined` — the
      // default zustand merge is a shallow top-level spread.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<StoreState>;
        const players =
          p.game && Array.isArray(p.game.players)
            ? p.game.players.map((pl, i) => ({
                ...createPlayer(i, current.game.startingLife),
                ...pl,
                id: `p${i}`, // normalize even if a persisted id is corrupt
                counters: { ...emptyCounters(), ...(pl?.counters ?? {}) },
                commanderDamage: pl?.commanderDamage ?? {},
              }))
            : current.game.players;
        const rawGame = p.game
          ? {
              ...current.game,
              ...p.game,
              turn: { ...current.game.turn, ...(p.game.turn ?? {}) },
              players,
            }
          : current.game;
        // Guard against a persisted layout / active turn that no longer matches
        // the players (corrupt storage): fall back to sane defaults.
        const ids = new Set(players.map((pl) => pl.id));
        const layoutOk =
          rawGame.layout?.playerCount === players.length &&
          rawGame.layout.placements.every((pl) => ids.has(pl.playerId));
        const game = {
          ...rawGame,
          layout: layoutOk ? rawGame.layout : defaultLayoutFor(players.length),
          turn: ids.has(rawGame.turn.activePlayerId)
            ? rawGame.turn
            : { ...rawGame.turn, activePlayerId: players[0]?.id ?? "p0" },
        };
        return {
          ...current,
          ...p,
          settings: { ...current.settings, ...(p.settings ?? {}) },
          customLayouts: p.customLayouts ?? current.customLayouts,
          game,
        };
      },
    },
  ),
);

// Dev-only: expose the store so the Playwright harness can set up scenarios.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __store: typeof useStore }).__store = useStore;
}
