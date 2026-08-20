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

export interface Settings {
  /** Default per-turn countdown budget, in seconds. */
  defaultTurnBudgetSec: number;
  /** On-screen scale of the turn timer pill (1 = default). */
  turnTimerScale: number;
  soundOn: boolean;
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
}
