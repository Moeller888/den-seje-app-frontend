import {
  assertSnapshot,
} from "https://deno.land/std/testing/snapshot.ts";
import { generateProductionPlan } from "../progressionPolicy.ts";
import { SUFFIX_REGISTRY, TAXONOMY_VERSION } from "../objectiveTaxonomy.ts";

Deno.test("progression snapshot – stable plans for known objectives", async (t) => {
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

  await assertSnapshot(t, {
    taxonomyVersion: TAXONOMY_VERSION,
    suffixRegistry: SUFFIX_REGISTRY,
    plans,
  });
});
