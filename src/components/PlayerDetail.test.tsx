import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlayerDetail } from "./PlayerDetail";
import { useStore } from "../state/store";

afterEach(cleanup);

describe("PlayerDetail", () => {
  it("opens without an infinite render loop and shows the player's life", () => {
    useStore.getState().newGame({ playerCount: 4, startingLife: 40 });

    // With the buggy selector (filter() in the store selector) this render
    // throws "Maximum update depth exceeded".
    expect(() =>
      render(<PlayerDetail playerId="p0" onClose={() => {}} />),
    ).not.toThrow();

    expect(screen.getByText("40")).toBeInTheDocument();
    // The 3 opponents should appear in the commander-damage section.
    expect(screen.getByText(/from P2/)).toBeInTheDocument();
  });
});
