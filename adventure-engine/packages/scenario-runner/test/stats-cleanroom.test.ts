import { describe, expect, it } from "vitest";
import { chiSquaredUniform, gammaQ } from "../src/index.ts";
// @ts-expect-error -- plain ESM tool without type declarations
import { FORBIDDEN, scan } from "../../../tools/check-clean-room.mjs";

describe("chi-squared helpers", () => {
  it("gammaQ matches known values", () => {
    // df = 2 → p = exp(-x/2)
    expect(gammaQ(1, 1)).toBeCloseTo(Math.exp(-1), 10);
    expect(gammaQ(1, 0.2)).toBeCloseTo(Math.exp(-0.2), 10);
    expect(gammaQ(2.5, 0)).toBe(1);
    // Q(0.5, x) = erfc(sqrt(x)); erfc(1) ≈ 0.157299
    expect(gammaQ(0.5, 1)).toBeCloseTo(0.157299, 5);
  });

  it("uniform counts give p ≈ 1, skewed counts give p ≈ 0", () => {
    expect(chiSquaredUniform([100, 100, 100]).p).toBeCloseTo(1, 6);
    const skew = chiSquaredUniform([300, 0, 0]);
    expect(skew.degreesOfFreedom).toBe(2);
    expect(skew.p).toBeLessThan(1e-10);
  });
});

describe("CR-02: clean-room boundary", () => {
  it("no file in the project references traceability or source-analysis material", () => {
    expect(FORBIDDEN.length).toBeGreaterThan(0);
    expect(scan()).toEqual([]);
  });
});
