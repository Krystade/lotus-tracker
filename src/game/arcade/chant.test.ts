import { describe, expect, it } from "vitest";
import { seeded } from "./rng";
import { extend, newChant, press } from "./chant";
import { PADS, type Pad } from "./symbols";

const other = (p: Pad): Pad => PADS.find((x) => x !== p)!;

describe("chant", () => {
  it("opens on a single colour with nothing scored", () => {
    const s = newChant(seeded(3));
    expect(s.sequence).toHaveLength(1);
    expect(PADS).toContain(s.sequence[0]);
    expect(s).toMatchObject({ at: 0, score: 0, over: false });
  });

  it("scores a round when the whole sequence is played back", () => {
    const s = newChant(seeded(3));
    const r = press(s, s.sequence[0]);
    expect(r.roundComplete).toBe(true);
    expect(r.wrong).toBe(false);
    expect(r.state.score).toBe(1);
  });

  it("does not score partway through a longer sequence", () => {
    const s = extend(newChant(seeded(3)), seeded(9));
    expect(s.sequence).toHaveLength(2);
    const r = press(s, s.sequence[0]);
    expect(r.roundComplete).toBe(false);
    expect(r.state.score).toBe(0);
    expect(r.state.at).toBe(1);
  });

  it("ends the run on a wrong colour and keeps the score earned", () => {
    let s = newChant(seeded(3));
    s = press(s, s.sequence[0]).state; // round 1 scored
    s = extend(s, seeded(9));
    const r = press(s, other(s.sequence[0]));
    expect(r.wrong).toBe(true);
    expect(r.state.over).toBe(true);
    expect(r.state.score).toBe(1);
  });

  it("a right colour in the wrong position is still wrong", () => {
    // Build a two-colour sequence whose colours differ, then play them swapped.
    let s = newChant(seeded(3));
    s = { ...s, sequence: ["W", "U"], at: 0 };
    const r = press(s, "U");
    expect(r.wrong).toBe(true);
  });

  it("ignores presses once the run is over", () => {
    const dead = { ...newChant(seeded(3)), over: true };
    const r = press(dead, dead.sequence[0]);
    expect(r.state).toBe(dead);
    expect(r.wrong).toBe(false);
    expect(r.roundComplete).toBe(false);
  });

  it("extending grows the sequence by one and rewinds the playback", () => {
    const s = press(newChant(seeded(3)), newChant(seeded(3)).sequence[0]).state;
    const next = extend(s, seeded(11));
    expect(next.sequence).toHaveLength(2);
    expect(next.sequence.slice(0, 1)).toEqual(s.sequence);
    expect(next.at).toBe(0);
    expect(next.score).toBe(1);
  });

  it("does not extend a finished run", () => {
    const dead = { ...newChant(seeded(3)), over: true };
    expect(extend(dead, seeded(11))).toBe(dead);
  });

  it("survives a full ten-round run", () => {
    const rng = seeded(42);
    let s = newChant(rng);
    for (let round = 1; round <= 10; round++) {
      for (const pad of s.sequence) {
        const r = press(s, pad);
        s = r.state;
        expect(r.wrong).toBe(false);
      }
      expect(s.score).toBe(round);
      s = extend(s, rng);
    }
    expect(s.sequence).toHaveLength(11);
  });
});
