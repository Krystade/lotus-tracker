import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CounterChips } from "./CounterChips";
import type { CounterSet } from "../state/types";

function counters(patch: Partial<CounterSet> = {}): CounterSet {
  return {
    tax: 0,
    poison: 0,
    energy: 0,
    experience: 0,
    storm: 0,
    charge: 0,
    custom: [],
    ...patch,
  };
}

function chips(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".tile__chip")].map((n) =>
    (n.textContent ?? "").replace(/\s+/g, " ").trim(),
  );
}

describe("CounterChips", () => {
  it("renders nothing when every counter is zero", () => {
    const { container } = render(<CounterChips counters={counters()} />);
    expect(chips(container)).toEqual([]);
  });

  it("shows a chip for a non-zero counter", () => {
    const { container } = render(<CounterChips counters={counters({ tax: 2 })} />);
    expect(chips(container)).toEqual(["TAX 2"]);
  });

  it("hides zero counters while showing non-zero ones", () => {
    const { container } = render(
      <CounterChips counters={counters({ poison: 1, energy: 3 })} />,
    );
    expect(chips(container)).toEqual(["PSN 1", "NRG 3"]);
  });

  it("shows every standard counter that is in play", () => {
    const { container } = render(
      <CounterChips
        counters={counters({
          tax: 2,
          poison: 1,
          energy: 1,
          experience: 1,
          storm: 4,
          charge: 5,
        })}
      />,
    );
    expect(chips(container)).toEqual([
      "TAX 2",
      "PSN 1",
      "NRG 1",
      "EXP 1",
      "STM 4",
      "CHG 5",
    ]);
  });

  it("flags poison as lethal at 10", () => {
    const { container } = render(
      <CounterChips counters={counters({ poison: 10 })} />,
    );
    expect(container.querySelectorAll(".tile__chip--warn")).toHaveLength(1);
  });

  it("does not flag poison below lethal", () => {
    const { container } = render(
      <CounterChips counters={counters({ poison: 9 })} />,
    );
    expect(container.querySelectorAll(".tile__chip--warn")).toHaveLength(0);
  });

  it("shows non-zero custom counters, abbreviated", () => {
    const { container } = render(
      <CounterChips
        counters={counters({
          custom: [{ id: "a", name: "Rad", value: 3 }],
        })}
      />,
    );
    expect(chips(container)).toEqual(["RAD 3"]);
  });

  it("hides custom counters sitting at zero", () => {
    const { container } = render(
      <CounterChips
        counters={counters({
          custom: [{ id: "a", name: "Rad", value: 0 }],
        })}
      />,
    );
    expect(chips(container)).toEqual([]);
  });
});
