import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  COMMANDER_TAX_STEP,
  type CounterKey,
  type CounterSet,
  type GameState,
  type LayoutConfig,
  type Player,
  type Settings,
} from "./types";
import { applyLifeDelta, clampCounter, clampLife } from "../game/life";
import { advanceTurn, tickTurn } from "../game/turn";
import { colorForSeat } from "../layout/colors";
import { defaultLayoutFor } from "../layout/presets";
import { uid } from "../util/id";

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
  const next: Player[] = [];
  for (let i = 0; i < count; i++) {
    next.push(existing[i] ?? createPlayer(i, startingLife));
  }
  return next;
}

function newGameState(
  playerCount: number,
  startingLife: number,
  settings: Settings,
  layout?: LayoutConfig,
): GameState {
  const players = createPlayers(playerCount, startingLife);
  const budget = settings.defaultTurnBudgetSec;
  return {
    players,
    startingLife,
    layout: layout ?? defaultLayoutFor(playerCount),
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
        set((s) => ({
          game: newGameState(playerCount, startingLife, s.settings, layout),
        })),

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

      setLife: (playerId, value) =>
        set((s) => ({
          game: {
            ...s.game,
            players: updatePlayer(s.game.players, playerId, (p) => ({
              ...p,
              life: clampLife(Math.round(value)),
            })),
          },
        })),

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
        set((s) => ({
          game: {
            ...s.game,
            players: updatePlayer(s.game.players, playerId, (p) => ({
              ...p,
              eliminated: !p.eliminated,
            })),
          },
        })),

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
      version: 1,
    },
  ),
);

// Dev-only: expose the store so the Playwright harness can set up scenarios.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __store: typeof useStore }).__store = useStore;
}
