import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { useStore } from "../state/store";
import { CounterQuickAdjust } from "./CounterQuickAdjust";

const s = () => useStore.getState();
const p0 = () => s().game.players[0];

beforeEach(() => {
  s().newGame({ playerCount: 4, startingLife: 40 });
});

describe("CounterQuickAdjust", () => {
  it("increases a standard counter by one", () => {
    const { getByLabelText } = render(
      <CounterQuickAdjust
        playerId="p0"
        target={{ kind: "standard", key: "poison" }}
        onClose={() => {}}
      />,
    );
    fireEvent.click(getByLabelText(/increase poison/i));
    expect(p0().counters.poison).toBe(1);
  });

  it("steps commander tax by two, matching the detail panel", () => {
    const { getByLabelText } = render(
      <CounterQuickAdjust
        playerId="p0"
        target={{ kind: "standard", key: "tax" }}
        onClose={() => {}}
      />,
    );
    fireEvent.click(getByLabelText(/increase commander tax/i));
    expect(p0().counters.tax).toBe(2);
    fireEvent.click(getByLabelText(/decrease commander tax/i));
    expect(p0().counters.tax).toBe(0);
  });

  it("never takes a counter below zero", () => {
    const { getByLabelText } = render(
      <CounterQuickAdjust
        playerId="p0"
        target={{ kind: "standard", key: "energy" }}
        onClose={() => {}}
      />,
    );
    fireEvent.click(getByLabelText(/decrease energy/i));
    expect(p0().counters.energy).toBe(0);
  });

  it("adjusts a custom counter", () => {
    s().addCustomCounter("p0", "Rad");
    const id = p0().counters.custom[0].id;
    const { getByLabelText } = render(
      <CounterQuickAdjust
        playerId="p0"
        target={{ kind: "custom", id }}
        onClose={() => {}}
      />,
    );
    fireEvent.click(getByLabelText(/increase Rad/i));
    fireEvent.click(getByLabelText(/increase Rad/i));
    expect(p0().counters.custom[0].value).toBe(2);
  });

  it("shows the counter's current value", () => {
    s().adjustCounter("p0", "poison", 4);
    const { getByText } = render(
      <CounterQuickAdjust
        playerId="p0"
        target={{ kind: "standard", key: "poison" }}
        onClose={() => {}}
      />,
    );
    expect(getByText("4")).toBeTruthy();
  });

  it("closes when the backdrop is tapped", () => {
    let closed = false;
    const { container } = render(
      <CounterQuickAdjust
        playerId="p0"
        target={{ kind: "standard", key: "poison" }}
        onClose={() => {
          closed = true;
        }}
      />,
    );
    fireEvent.click(container.querySelector(".overlay")!);
    expect(closed).toBe(true);
  });

  it("renders nothing for a custom counter that no longer exists", () => {
    const { container } = render(
      <CounterQuickAdjust
        playerId="p0"
        target={{ kind: "custom", id: "gone" }}
        onClose={() => {}}
      />,
    );
    expect(container.querySelector(".quick")).toBeNull();
  });
});
