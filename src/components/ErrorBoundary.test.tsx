import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

const Boom = (): React.ReactElement => {
  throw new Error("kaboom");
};

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React logs the caught error; silence it so the run stays readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders its children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>the board</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("the board")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a recovery screen instead of unmounting when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    // The whole point: something is on screen rather than nothing.
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Reload/)).toBeTruthy();
    expect(screen.getByText(/Clear saved data/)).toBeTruthy();
  });

  it("surfaces the error message so a report is possible", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/kaboom/)).toBeTruthy();
  });

  it("discriminates — without a throw there is no alert to find", () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    );
    expect(screen.queryByText(/Clear saved data/)).toBeNull();
  });
});
