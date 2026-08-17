import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { LookPreview } from "./LookPreview";
import { LOOK_STYLES, lookId, resolveLook } from "../layout/looks";

const look = (id: string) => resolveLook(id, "#3E92CC");

describe("LookPreview", () => {
  it("renders the style as a data attribute so it shares the tiles' CSS", () => {
    const { container } = render(
      <LookPreview look={look("blue-lava")} className="x" />,
    );
    expect(container.querySelector("[data-style='lava']")).not.toBeNull();
  });

  it("renders one layer per layer the style declares", () => {
    for (const style of LOOK_STYLES) {
      const l = look(lookId("blue", style.id));
      const { container } = render(<LookPreview look={l} className="x" />);
      expect(container.querySelectorAll(".tile__look span")).toHaveLength(
        l.layers,
      );
    }
  });

  it("renders no layer container for a static style", () => {
    const { container } = render(<LookPreview look={look("blue")} className="x" />);
    expect(container.querySelector(".tile__look")).toBeNull();
  });

  it("passes the hue through as custom properties", () => {
    const { container } = render(
      <LookPreview look={look("blue-drift")} className="x" />,
    );
    const el = container.querySelector(".look") as HTMLElement;
    expect(el.style.getPropertyValue("--look-base")).toBe("#3E92CC");
    expect(el.style.getPropertyValue("--look-hi")).not.toBe("");
  });

  it("hides decoration from assistive tech", () => {
    const { container } = render(
      <LookPreview look={look("blue-lava")} className="x" />,
    );
    expect(container.querySelector(".tile__look")).toHaveAttribute("aria-hidden");
  });
});
