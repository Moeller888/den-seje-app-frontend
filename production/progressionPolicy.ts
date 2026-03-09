 /**
  * progressionPolicy.ts
  *
  * Deterministisk production-plan generator.
  *
  * REGLER:
  * - Læser global SUFFIX_REGISTRY
  * - Ekstraherer suffix deterministisk
  * - Ukendt suffix => throw (fail fast)
  * - Ingen implicit defaults
  * - Stabil sortering af cognitive levels
  */

 import { SUFFIX_REGISTRY, type Suffix } from "./objectiveTaxonomy.ts";

 export type CognitiveLevel = "recall" | "explain" | "analyze";

 export interface ProductionPlanItem {
   objective: string;
   cognitive: CognitiveLevel;
 }

 /**
  * Ekstraher suffix fra objective.
  * Matcher mod kendte suffixes i registry.
  * Fail-fast hvis ingen match.
  */
 function extractSuffix(objective: string): Suffix {
  const knownSuffixes = (Object.keys(SUFFIX_REGISTRY) as Suffix[])
    .sort((a, b) => b.length - a.length); // Longest suffix first

  const match = knownSuffixes.find((suffix) =>
    objective.endsWith(suffix)
  );

  if (!match) {
    throw new Error(
      "[progressionPolicy] Unknown suffix in objective: " + objective
    );
  }

  return match;
}

 /**
  * Stabil sorteringsorden for cognitive levels.
  * Forhindrer snapshot-støj.
  */
 const COGNITIVE_ORDER: Record<CognitiveLevel, number> = {
   recall: 0,
   explain: 1,
   analyze: 2,
 };

 /**
  * Generér deterministisk production plan
  */
 export function generateProductionPlan(
   objective: string
 ): ProductionPlanItem[] {
   const suffix = extractSuffix(objective);

   const registryEntry = SUFFIX_REGISTRY[suffix];

   if (!registryEntry) {
     // Ekstra sikkerhed (bør aldrig ske pga. extractSuffix)
     throw new Error(
       "[progressionPolicy] Registry lookup failed for suffix: " + suffix
     );
   }

   const sortedLevels = [...registryEntry.cognitive].sort(
     (a, b) => COGNITIVE_ORDER[a] - COGNITIVE_ORDER[b]
   );

   return sortedLevels.map((level) => ({
     objective,
     cognitive: level,
   }));
 }

