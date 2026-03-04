import { describe, it, expect } from "vitest";
import { generateProductionPlan } from "../progressionPolicy";

describe("progression snapshot", () => {
  it("should generate stable plans for known objectives", () => {
    const objectives = [
      "ww2_poland_invasion_start_year",
      "ww2_poland_invasion_impact",
      "ww2_france_fall_role",
      "ww2_france_fall_turning_point",
    ];

    const plans = objectives.map((o) => ({
      objective: o,
      plan: generateProductionPlan(o),
    }));

    expect(plans).toMatchSnapshot();
  });
});
