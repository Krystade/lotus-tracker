import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_SETTINGS,
  COMMANDER_TAX_STEP,
  type ArcadeBests,
  type CounterKey,
  type CounterSet,
  type GameState,
  type GameSetup,
  type LayoutConfig,
  type Player,
  type PlayerProfile,
  type Settings,
  type StickerId,
} from "./types";
import { sanitizeBests, sanitizeCounters, sanitizeSettings } from "./sanitize";
import {
  applyLifeDelta,
  clampCounter,
  clampLife,
  clampStartingLife,
} from "../game/life";
import { advanceTurn, tickTurn } from "../game/turn";
import { colorForSeat } from "../layout/colors";
import { clockwiseSeatOrder } from "../layout/order";
import { defaultLayoutFor } from "../layout/presets";
import { layoutCoversSeats } from "../layout/validate";
import { uid } from "../util/id";
import { isBetter } from "../game/arcade/bests";
import { appendLog, diffGame, sanitizeLog } from "../game/log";
import { giveSticker, sanitizeStickers } from "../game/stickers";

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
    stickers: [],
    log: [],
  };
}

/**
 * Every game change passes through here, so the log sees all of them without
 * each action having to remember to write one. An action that sets its own
 * `log` (a new game, a reset) is starting over and is not diffed. Stickers
 * held by a seat that no longer exists are dropped.
 */
function finishGame(prev: GameState, next: GameState): GameState {
  const seats = new Set(next.players.map((p) => p.id));
  const stickers = next.stickers.every((st) => seats.has(st.holder))
    ? next.stickers
    : next.stickers.filter((st) => seats.has(st.holder));
  const settled = stickers === next.stickers ? next : { ...next, stickers };
  if (settled.log !== prev.log) return settled;
  const changes = diffGame(prev, settled);
  if (changes.length === 0) return settled;
  return {
    ...settled,
    log: appendLog(prev.log, changes, {
      turn: settled.turn.turnNumber,
      at: settled.gameElapsedSec,
      now: Date.now(),
    }),
  };
}

export interface StoreState {
  game: GameState;
  settings: Settings;
  customLayouts: LayoutConfig[];

  // lifecycle
  profiles: PlayerProfile[];
  setups: GameSetup[];
  /** Pass-the-time game records; survives new games, cleared only with storage. */
  arcadeBests: ArcadeBests;

  newGame: (opts: {
    playerCount: number;
    startingLife: number;
    layout?: LayoutConfig;
    /** Seat these saved players; their count wins over playerCount. */
    profileIds?: string[];
  }) => void;

  // saved players & setups
  addProfile: (name: string, look: string) => void;
  updateProfile: (id: string, patch: Partial<Omit<PlayerProfile, "id">>) => void;
  deleteProfile: (id: string) => void;
  saveSetup: (name: string) => void;
  applySetup: (id: string) => void;
  deleteSetup: (id: string) => void;
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
  setPlayerLook: (playerId: string, look: string) => void;
  setFirstPlayer: (playerId: string) => void;
  /** Hand a sticker to a seat, or take it off the table with null. */
  giveSticker: (id: StickerId, holder: string | null) => void;

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

  // pass-the-time games
  recordArcadeScore: (gameId: string, value: number) => void;
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
    (rawSet) => {
      type Next = Partial<StoreState> | ((s: StoreState) => Partial<StoreState>);
      const set = (next: Next) =>
        rawSet((s) => {
          const out = typeof next === "function" ? next(s) : next;
          return out.game && out.game !== s.game
            ? { ...out, game: finishGame(s.game, out.game) }
            : out;
        });
      return {
      game: newGameState(4, 40, DEFAULT_SETTINGS),
      settings: DEFAULT_SETTINGS,
      customLayouts: [],
      profiles: [],
      setups: [],
      arcadeBests: {},

      newGame: ({ playerCount, startingLife, layout, profileIds }) =>
        set((s) => {
          // Seating saved players decides the pod size; ids that no longer
          // exist are simply skipped.
          const seated = (profileIds ?? [])
            .map((id) => s.profiles.find((p) => p.id === id))
            .filter((p): p is PlayerProfile => !!p);
          const count = seated.length > 0 ? seated.length : playerCount;
          // Keep the current (possibly custom) arrangement if the pod size is
          // unchanged, instead of always snapping back to the default preset.
          const keep =
            layout ??
            (s.game.layout.playerCount === count ? s.game.layout : undefined);
          const game = newGameState(count, startingLife, s.settings, keep);
          if (seated.length > 0) {
            game.players = game.players.map((p, i) =>
              seated[i] ? { ...p, name: seated[i].name, look: seated[i].look } : p,
            );
          }
          return { game };
        }),

      addProfile: (name, look) =>
        set((s) => {
          const trimmed = name.trim().slice(0, 16);
          if (!trimmed) return {};
          return {
            profiles: [
              ...s.profiles,
              { id: `pr-${uid()}`, name: trimmed, look },
            ],
          };
        }),

      updateProfile: (id, patch) =>
        set((s) => ({
          profiles: s.profiles.map((p) =>
            p.id === id
              ? {
                  ...p,
                  ...patch,
                  name: (patch.name ?? p.name).trim().slice(0, 16) || p.name,
                }
              : p,
          ),
        })),

      deleteProfile: (id) =>
        set((s) => ({ profiles: s.profiles.filter((p) => p.id !== id) })),

      saveSetup: (name) =>
        set((s) => {
          const trimmed = name.trim().slice(0, 24);
          if (!trimmed) return {};
          return {
            setups: [
              ...s.setups,
              {
                id: `setup-${uid()}`,
                name: trimmed,
                playerCount: s.game.players.length,
                startingLife: s.game.startingLife,
                layout: {
                  ...s.game.layout,
                  placements: s.game.layout.placements.map((p) => ({ ...p })),
                },
                turnTimerEnabled: s.settings.turnTimerEnabled,
                defaultTurnBudgetSec: s.settings.defaultTurnBudgetSec,
                players: s.game.players.map((p) => ({
                  name: p.name,
                  ...(p.look ? { look: p.look } : {}),
                })),
              },
            ],
          };
        }),

      applySetup: (id) =>
        set((s) => {
          const setup = s.setups.find((x) => x.id === id);
          if (!setup) return {};
          const settings = {
            ...s.settings,
            turnTimerEnabled: setup.turnTimerEnabled,
            defaultTurnBudgetSec: setup.defaultTurnBudgetSec,
          };
          const game = newGameState(
            setup.playerCount,
            setup.startingLife,
            settings,
            setup.layout,
          );
          // A saved group: put everyone back in their seat, as they looked.
          const seated = Array.isArray(setup.players) ? setup.players : [];
          return {
            settings,
            game: {
              ...game,
              players: game.players.map((p, i) => {
                const who = seated[i];
                if (!who || typeof who.name !== "string") return p;
                return {
                  ...p,
                  name: who.name.slice(0, 16) || p.name,
                  ...(typeof who.look === "string" ? { look: who.look } : {}),
                };
              }),
            },
          };
        }),

      deleteSetup: (id) =>
        set((s) => ({ setups: s.setups.filter((x) => x.id !== id) })),

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
              stickers: [],
              log: [],
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
              ? advanceTurn(
                  s.game.turn,
                  players,
                  s.settings.defaultTurnBudgetSec,
                  clockwiseSeatOrder(s.game.layout),
                  s.settings.turnTimerEnabled,
                )
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

      // Changes this seat for this game only. The profile it came from is a
      // template, not a live link -- same as renaming a seat mid-game.
      setPlayerLook: (playerId, look) =>
        set((s) => ({
          game: {
            ...s.game,
            players: updatePlayer(s.game.players, playerId, (p) => ({
              ...p,
              look,
            })),
          },
        })),

      giveSticker: (id, holder) =>
        set((s) => ({
          game: { ...s.game, stickers: giveSticker(s.game.stickers, id, holder) },
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
              clockwiseSeatOrder(s.game.layout),
              s.settings.turnTimerEnabled,
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
          // A layout that does not place every seat exactly once cannot
          // describe the table — fall back to the preset rather than seat
          // players at coordinates that do not exist.
          const safeLayout = layoutCoversSeats(
            layout,
            players.map((p) => p.id),
          )
            ? layout
            : defaultLayoutFor(players.length);
          const activeExists = players.some(
            (p) => p.id === s.game.turn.activePlayerId,
          );
          return {
            game: {
              ...s.game,
              players,
              layout: safeLayout,
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

      // Which way is "better" belongs to the game, not to the caller, so a
      // losing score can be handed over without the UI having to compare.
      recordArcadeScore: (gameId, value) =>
        set((s) =>
          isBetter(gameId, value, s.arcadeBests[gameId])
            ? { arcadeBests: { ...s.arcadeBests, [gameId]: value } }
            : {},
        ),
      };
    },
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
                counters: sanitizeCounters(pl?.counters),
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
        const layoutOk =
          rawGame.layout?.playerCount === players.length &&
          layoutCoversSeats(
            rawGame.layout,
            players.map((pl) => pl.id),
          );
        const ids = new Set(players.map((pl) => pl.id));
        const game = {
          ...rawGame,
          stickers: sanitizeStickers(rawGame.stickers, ids),
          log: sanitizeLog(rawGame.log),
          layout: layoutOk ? rawGame.layout : defaultLayoutFor(players.length),
          turn: ids.has(rawGame.turn.activePlayerId)
            ? rawGame.turn
            : { ...rawGame.turn, activePlayerId: players[0]?.id ?? "p0" },
        };
        return {
          ...current,
          ...p,
          settings: sanitizeSettings(
            { ...current.settings, ...(p.settings ?? {}) },
            current.settings,
          ),
          customLayouts: p.customLayouts ?? current.customLayouts,
          profiles: Array.isArray(p.profiles) ? p.profiles : current.profiles,
          setups: Array.isArray(p.setups) ? p.setups : current.setups,
          arcadeBests: sanitizeBests(p.arcadeBests),
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
