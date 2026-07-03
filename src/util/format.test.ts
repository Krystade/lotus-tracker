import { describe, expect, it } from "vitest";
import { formatClock, formatGameClock } from "./format";

describe("format", () => {
  it("formatClock is m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(600)).toBe("10:00");
  });

  it("formatGameClock is mm:ss and rolls to h:mm:ss past an hour", () => {
    expect(formatGameClock(65)).toBe("01:05");
    expect(formatGameClock(3600)).toBe("1:00:00");
    expect(formatGameClock(7530)).toBe("2:05:30");
  });
});
