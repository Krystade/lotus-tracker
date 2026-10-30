export type Rotation = 0 | 90 | 180 | 270;

/** Standard counter keys shown on every player (besides custom). */
export type CounterKey =
  | "tax"
  | "poison"
  | "energy"
  | "experience"
  | "storm"
  | "charge";

export interface CustomCounter {
  id: string;
  name: string;
  value: number;
}

export interface CounterSet {
  tax: number;
  poison: number;
  energy: number;
  experience: number;
  storm: number;
  charge: number;
  custom: CustomCounter[];
}

/** Position of a draggable element within a tile, as % of the tile's own
 *  (pre-rotation) content box. */
export interface TilePos {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  life: number;
  counters: CounterSet;
  /** Commander combat damage taken, keyed by the id of the opponent dealing it. */
  commanderDamage: Record<string, number>;
  eliminated: boolean;
  /** Custom turn-timer position for this seat; remembered across turns. */
  timerPos?: TilePos;
  /** Chosen tile look; falls back to the flat seat colour when absent. */
  look?: string;
}

/** A saved player, reusable across games. Stored on this device only. */
export interface PlayerProfile {
  id: string;
  name: string;
  look: string;
}

export interface Placement {
  playerId: string;
  /** 1-based CSS grid line for the start row/column. */
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  rotation: Rotation;
}

export interface LayoutConfig {
  id: string;
  name: string;
  playerCount: number;
  rows: number;
  cols: number;
  placements: Placement[];
  builtIn: boolean;
}

export type TurnTimerPlacement = "drag" | "corner";

export interface Settings {
  /** Default per-turn countdown budget, in seconds. */
  defaultTurnBudgetSec: number;
  /**
   * Size of the turn timer pill, relative to the tile it sits in (1 = default,
   * about a third of the most the tile can hold; ~3 fills it).
   */
  turnTimerScale: number;
  /** "drag": wherever each player last dragged it. "corner": the corner of
   * the active tile where the most tiles meet -- the middle of the table. */
  turnTimerPlacement: TurnTimerPlacement;
  soundOn: boolean;
  /** Loudness of the 0:00 chime, 0..1. */
  alertVolume: number;
  /** Soft tick and ring colour change at 0:30 and 0:10. */
  turnWarnOn: boolean;
  vibrateOn: boolean;
  keepAwake: boolean;
  turnTimerEnabled: boolean;
  /** Flashes and kicks on damage, healing and death. */
  effectsOn: boolean;
  /** Motion on animated tile looks. Off freezes them without unmounting. */
  animateLooks: boolean;
  /** Multiplier on look animation speed; 1 is the authored pace. */
  lookSpeed: number;
  /** Multiplier on how much of the tile the damage/heal wash covers. */
  effectStrength: number;
}

export interface TurnState {
  activePlayerId: string;
  turnNumber: number;
  budgetSec: number;
  remainingSec: number;
  running: boolean;
  expired: boolean;
}

export interface GameState {
  players: Player[];
  startingLife: number;
  layout: LayoutConfig;
  turn: TurnState;
  gameElapsedSec: number;
  gameTimerRunning: boolean;
  /** Shared markers (monarch, initiative...) and who holds them. */
  stickers: StickerHold[];
  /** What happened this game, oldest first. */
  log: LogEntry[];
}

export type StickerId = "monarch" | "initiative" | "blessing" | "ring";

export interface StickerHold {
  id: StickerId;
  holder: string;
}

export type LogKind = "life" | "cmdr" | "poison" | "sticker";

export interface LogEntry {
  /** Unique within a game; React key and undo target. */
  n: number;
  kind: LogKind;
  playerId: string;
  /** Change in life / commander damage / poison. 0 for stickers. */
  delta: number;
  /** The value after the change (life, damage from `from`, poison). */
  value: number;
  /** Commander damage source, or the sticker's previous holder. */
  from?: string;
  sticker?: StickerId;
  turn: number;
  /** Game clock at the time, seconds. */
  at: number;
  /** Wall clock of the last edit, ms; rapid taps merge into one entry. */
  ts: number;
}

/** Lethal thresholds per current Commander rules. */
export const POISON_LETHAL = 10;
export const COMMANDER_DAMAGE_LETHAL = 21;
export const COMMANDER_TAX_STEP = 2;

/** A named snapshot of how a game is set up, reloadable later. */
export interface GameSetup {
  id: string;
  name: string;
  playerCount: number;
  startingLife: number;
  layout: LayoutConfig;
  turnTimerEnabled: boolean;
  defaultTurnBudgetSec: number;
  /** Who sat where, by seat. Absent on setups saved before groups existed. */
  players?: { name: string; look?: string }[];
}


/** Shipped defaults. Lives here so persisted-state repair can reach it
 * without importing the store, which imports the repair. */
export const DEFAULT_SETTINGS: Settings = {
  defaultTurnBudgetSec: 300,
  turnTimerScale: 1,
  turnTimerPlacement: "drag",
  soundOn: true,
  alertVolume: 0.5,
  turnWarnOn: true,
  vibrateOn: true,
  keepAwake: true,
  turnTimerEnabled: true,
  effectsOn: true,
  animateLooks: true,
  lookSpeed: 1,
  effectStrength: 1,
};

/** Best score per pass-the-time game, keyed by game id. Device-local. */
export type ArcadeBests = Record<string, number>;
