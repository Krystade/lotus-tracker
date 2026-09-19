import { pick, type Rng } from "./rng";
import { PADS, type Pad } from "./symbols";

/**
 * Chant: the colour sequence grows by one each round and you play it back.
 *
 * Score is the number of rounds completed, so failing on the first colour of
 * round 4 scores 3.
 */
export interface ChantState {
  sequence: Pad[];
  /** How far into the sequence the player has correctly got this round. */
  at: number;
  /** Rounds completed. */
  score: number;
  over: boolean;
}

export function newChant(rng: Rng): ChantState {
  return { sequence: [pick(PADS, rng)], at: 0, score: 0, over: false };
}

export interface PressResult {
  state: ChantState;
  /** Wrong pad -- the run is over. */
  wrong: boolean;
  /** The sequence was played back in full; the caller should extend it. */
  roundComplete: boolean;
}

export function press(s: ChantState, pad: Pad): PressResult {
  if (s.over) return { state: s, wrong: false, roundComplete: false };
  if (pad !== s.sequence[s.at]) {
    return { state: { ...s, over: true }, wrong: true, roundComplete: false };
  }
  const at = s.at + 1;
  if (at < s.sequence.length) {
    return { state: { ...s, at }, wrong: false, roundComplete: false };
  }
  return {
    state: { ...s, at, score: s.score + 1 },
    wrong: false,
    roundComplete: true,
  };
}

/** Add a colour and hand the turn back to the machine. */
export function extend(s: ChantState, rng: Rng): ChantState {
  if (s.over) return s;
  return { ...s, sequence: [...s.sequence, pick(PADS, rng)], at: 0 };
}
