 /**
  * objectiveTaxonomy.ts
  *
  * Global, versioneret suffix-governance.
  *
  * REGLER:
  * - Registry er global (ikke domain-scoped)
  * - Registry er data-only (ingen funktioner)
  * - Nye suffixes kræver design-review + version-bump
  * - Ændringer i cognitive levels kræver MAJOR version-bump
  * - Ukendt suffix skal håndteres fail-fast i generatoren
  */

 export const TAXONOMY_VERSION = "1.0.0" as const;

 export const SUFFIX_REGISTRY = {
   /**
    * =========================
    * TEMPORAL FACTS
    * =========================
    */

   _start_year: {
     type: "temporal_fact",
     cognitive: ["recall"],
   },

   _end_year: {
     type: "temporal_fact",
     cognitive: ["recall"],
   },

   /**
    * =========================
    * ACTOR / RELATION
    * =========================
    */

   _role: {
     type: "actor_role",
     cognitive: ["recall", "explain"],
   },

   _alliance_status: {
     type: "relation",
     cognitive: ["recall", "explain"],
   },

   /**
    * =========================
    * RESULT
    * =========================
    */

   _outcome: {
     type: "result",
     cognitive: ["recall", "explain"],
   },

   /**
    * =========================
    * CAUSAL
    * =========================
    */

   _impact: {
     type: "causal",
     cognitive: ["explain", "analyze"],
   },

   _consequence: {
     type: "causal",
     cognitive: ["explain", "analyze"],
   },

   /**
    * =========================
    * STRATEGIC / ANALYTICAL
    * =========================
    */

   _strategy: {
     type: "strategic",
     cognitive: ["explain", "analyze"],
   },

   _turning_point: {
     type: "analytical",
     cognitive: ["analyze"],
   },
 } as const;

 export type Suffix = keyof typeof SUFFIX_REGISTRY;
