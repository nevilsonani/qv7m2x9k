import { describe, expect, it } from "vitest";

import { C, divergingFill, sequentialFill } from "./colors";

describe("divergingFill", () => {
  it("is neutral at zero and for missing values", () => {
    expect(divergingFill(0)).toContain("0%");
    expect(divergingFill(null)).toBe(C.mid);
  });

  it("uses the over-forecast pole for positive errors and the under pole for negative", () => {
    expect(divergingFill(20)).toContain(C.over);
    expect(divergingFill(-20)).toContain(C.under);
  });

  it("saturates at the cap", () => {
    expect(divergingFill(400, 40)).toBe(divergingFill(40, 40));
  });
});

describe("sequentialFill", () => {
  it("gets stronger with magnitude", () => {
    const strength = (fill: string) => Number(/ (\d+)%/.exec(fill)?.[1]);
    expect(strength(sequentialFill(10, 0, 100))).toBeLessThan(strength(sequentialFill(90, 0, 100)));
  });
});
