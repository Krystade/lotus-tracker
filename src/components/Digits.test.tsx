import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Digits } from "./Digits";

/** The digits marked as rotation-ambiguous, in render order. */
function marked(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".digit--ambiguous")].map(
    (n) => n.textContent ?? "",
  );
}

describe("Digits", () => {
  it("marks a lone 6", () => {
    const { container } = render(<Digits value={6} />);
    expect(marked(container)).toEqual(["6"]);
  });

  it("marks a lone 9", () => {
    const { container } = render(<Digits value={9} />);
    expect(marked(container)).toEqual(["9"]);
  });

  it("marks each ambiguous digit in a multi-digit number", () => {
    const { container } = render(<Digits value={69} />);
    expect(marked(container)).toEqual(["6", "9"]);
  });

  it("marks only the ambiguous digit, leaving others alone", () => {
    const { container } = render(<Digits value={16} />);
    expect(marked(container)).toEqual(["6"]);
    expect(container.textContent).toBe("16");
  });

  it("marks nothing in a number without 6 or 9", () => {
    const { container } = render(<Digits value={40} />);
    expect(marked(container)).toEqual([]);
  });

  it("preserves a negative sign", () => {
    const { container } = render(<Digits value={-6} />);
    expect(container.textContent).toBe("-6");
    expect(marked(container)).toEqual(["6"]);
  });

  it("renders the full value as text regardless of marking", () => {
    const { container } = render(<Digits value={96} />);
    expect(container.textContent).toBe("96");
  });
});
