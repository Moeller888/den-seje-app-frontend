// D-098 — the ONE place that decides whether an exposed fabric top is a fault.
// ---------------------------------------------------------------------------------------------
// WHY THIS MODULE EXISTS. The question "is the fabric underlayer's top edge exposed?" was answered
// in THREE tracked tools, three different ways, none of them shared:
//
//   fabric-underlayer-poc.mjs  — every uncovered fabric top counts. Reported 28 columns.
//   fabric-plate-fit.mjs       — same walk, still no silhouette test. Reported 10 columns.
//   plate-microfit.mjs         — added a silhouette test and reported 3. Those 3 became D-097 §7's
//                                "3 columns need ~10 px of new plate artwork".
//
// D-098 measured those 3 columns before drawing anything, and none of them is a cut in the garment:
//
//   * the whole proposed correction was 10 pixels (4 at x=338, 4 at x=339, 2 at x=687);
//   * all 10 are outside `torso-edit-allowed-v1` and on `torso-protect-v1` — the mask spec's gate
//     `protect-is-complement-of-edit` passes with 0 px, so those are the same statement, and both
//     "0 ink outside edit" and "0 ink on protect" are binding. Nobody may paint there, illustrator
//     included;
//   * 8 of the 10 are ALREADY drawn opaque by the existing plate and clipped away by the edit mask,
//     so adding artwork at those coordinates changes nothing.
//
// THE BUG WAS IN TWO PLACES, WHICH IS WHY FIXING IT ONCE DID NOT HOLD.
//   (a) The micro-fit test excused a fabric top that sits on `maskTop` — the column's FIRST
//       mandatory run. A column's mandatory mask can be DISCONTINUOUS: at x=338 it runs y 646–649
//       and again y 656–693, with rows 650–655 outside the garment altogether. The top of that
//       second run is equally the garment's own outer edge, and the test called it a cut.
//       100 of the 370 mandatory columns are multi-run; the silhouette wobbles row to row.
//   (b) It never asked whether the fabric pixel was inside the mandatory mask AT ALL. The sleeve
//       shape is generous by design ("the mask is the authority"), so some fabric sits outside the
//       mandatory region and its own top edge shows. That is x=687.
//
// A cut is only meaningful where the garment is REQUIRED to be. Hence three categories, and only
// one of them is a fault. Category B is NOT folded into "silhouette": it is a real open question
// about the fabric shape, and hiding it inside A is how a metric stops being trustworthy.
//
// THE THRESHOLD IS UNCHANGED AND STILL EXACTLY ZERO category-C columns. What changed is which
// pixels the classifier inspects.
//
// PURE MODULE: no file IO, no randomness, no time, no network. Same input, same output.

export const CATEGORY = Object.freeze({
  /** Fabric top is inside the mandatory mask and at most one row below the top of ITS OWN run —
   *  the garment's legitimate outer silhouette. Not a fault. */
  A: "mandatory_run_silhouette",
  /** Fabric top is outside the mandatory mask. Not a garment cut; a question about the fabric
   *  mask's shape. Reported separately and never relabelled as silhouette. */
  B: "non_mandatory_fabric",
  /** Fabric top is inside the mandatory mask, more than one row below its own run's top, with
   *  nothing opaque above it. The ONLY category that counts against the zero threshold. */
  C: "true_cut",
});

/** The number of rows a fabric top may sit below its run's top and still be that run's own edge.
 *  One, because the mask is upscaled 2x from the base and a boundary row can land either side. */
export const SILHOUETTE_TOLERANCE_ROWS = 1;

/** Category C is a defect. The threshold is zero and is not configurable — a caller that could
 *  pass its own limit is a caller that can weaken the gate. */
export const TRUE_CUT_THRESHOLD = 0;

// The mask contract: `hard` is BOOLEAN. Antialiasing is resolved when the mask is loaded (alpha > 0),
// never here — a caller that hands us alpha would invent runs out of feathered edges, which is
// exactly the failure this module is meant to make impossible. So we refuse it outright.
function assertBooleanMask(mask, name) {
  if (!mask || typeof mask.length !== "number") throw new Error(`${name}: expected an indexable mask`);
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i];
    if (v !== 0 && v !== 1) throw new Error(`${name}: not boolean at index ${i} (value ${v}) — pass a 0/1 mask, not alpha`);
  }
}

/**
 * Every maximal run of consecutive mandatory rows in one column, top to bottom.
 * A single-row run is a run: `{ y0: n, y1: n }`.
 * @returns {{y0:number, y1:number}[]} ascending by y0, never overlapping
 */
export function maskRuns(hard, width, height, x) {
  if (!Number.isInteger(x) || x < 0 || x >= width) throw new Error(`maskRuns: x ${x} outside 0..${width - 1}`);
  const runs = [];
  let start = -1;
  for (let y = 0; y < height; y++) {
    const on = hard[y * width + x] === 1;
    if (on && start < 0) start = y;
    else if (!on && start >= 0) { runs.push({ y0: start, y1: y - 1 }); start = -1; }
  }
  if (start >= 0) runs.push({ y0: start, y1: height - 1 });
  return runs;
}

/** The run containing y, or null when y is between runs or outside every run. */
export function runContaining(runs, y) {
  for (const r of runs) if (y >= r.y0 && y <= r.y1) return r;
  return null;
}

/**
 * Classify ONE fabric-top pixel. This is the whole decision, in one place.
 * @returns {{category:string, run:{y0:number,y1:number}|null, rowsBelowRunTop:number|null}}
 */
export function classifyFabricTop(hard, width, height, x, fabricTop) {
  const runs = maskRuns(hard, width, height, x);
  const run = runContaining(runs, fabricTop);
  // Outside every mandatory run — whether beyond the mask entirely or in the gap between two runs —
  // the garment is not required to be there, so it cannot be cut there.
  if (run === null) return { category: CATEGORY.B, run: null, rowsBelowRunTop: null, runs };
  const rowsBelow = fabricTop - run.y0;
  return {
    category: rowsBelow <= SILHOUETTE_TOLERANCE_ROWS ? CATEGORY.A : CATEGORY.C,
    run, rowsBelowRunTop: rowsBelow, runs,
  };
}

/**
 * The rule D-097 shipped, kept ONLY so the regression stays provable: it compares against the
 * column's first mandatory row and knows nothing about later runs or about non-mandatory fabric.
 * Never use it to gate anything.
 * @returns {"silhouette"|"cut"}
 */
export function classifyFabricTopLegacyD097(hard, width, height, x, fabricTop) {
  let columnMaskTop = -1;
  for (let y = 0; y < height; y++) if (hard[y * width + x] === 1) { columnMaskTop = y; break; }
  return (columnMaskTop >= 0 && fabricTop <= columnMaskTop + SILHOUETTE_TOLERANCE_ROWS) ? "silhouette" : "cut";
}

/**
 * Walk every column, find each one's topmost visible-fabric pixel, drop the ones that are covered
 * from directly above, and classify what remains.
 *
 * @param {object}     o
 * @param {Uint8Array} o.hard           boolean mandatory mask
 * @param {Uint8Array} o.visibleFabric  boolean: fabric that actually shows in the composite
 * @param {Uint8Array} o.opaque         boolean: the composite is opaque at this pixel
 * @param {Uint8Array} [o.edit]         boolean edit-allowed mask, for reporting closability
 * @param {Uint8Array} [o.protect]      boolean protect mask, for reporting closability
 */
export function classifyExposure({ hard, visibleFabric, opaque, edit = null, protect = null, width, height }) {
  assertBooleanMask(hard, "hard");
  assertBooleanMask(visibleFabric, "visibleFabric");
  assertBooleanMask(opaque, "opaque");
  if (edit) assertBooleanMask(edit, "edit");
  if (protect) assertBooleanMask(protect, "protect");

  const columns = [];
  for (let x = 0; x < width; x++) {
    let top = -1;
    for (let y = 0; y < height; y++) if (visibleFabric[y * width + x] === 1) { top = y; break; }
    if (top <= 0) continue;                                  // no fabric, or fabric at row 0
    const above = (top - 1) * width + x;
    if (opaque[above] === 1) continue;                       // covered from directly above: fine
    const c = classifyFabricTop(hard, width, height, x, top);
    columns.push({
      x, fabricTop: top, category: c.category, run: c.run, rowsBelowRunTop: c.rowsBelowRunTop,
      maskRuns: c.runs,
      legacyD097: classifyFabricTopLegacyD097(hard, width, height, x, top),
      aboveIsMandatory: hard[above] === 1,
      aboveIsEditAllowed: edit ? edit[above] === 1 : null,
      aboveIsProtected: protect ? protect[above] === 1 : null,
      // Whether ANY artwork could close this column at all. False means the mask forbids ink there.
      closableByAnyArtwork: edit ? edit[above] === 1 : null,
    });
  }

  const of = (cat) => columns.filter((c) => c.category === cat).map((c) => c.x);
  const byCategory = {
    [CATEGORY.A]: of(CATEGORY.A),
    [CATEGORY.B]: of(CATEGORY.B),
    [CATEGORY.C]: of(CATEGORY.C),
  };
  return {
    columns, byCategory,
    trueCutColumns: byCategory[CATEGORY.C],
    counts: {
      [CATEGORY.A]: byCategory[CATEGORY.A].length,
      [CATEGORY.B]: byCategory[CATEGORY.B].length,
      [CATEGORY.C]: byCategory[CATEGORY.C].length,
      flagged: columns.length,
      legacyD097Cut: columns.filter((c) => c.legacyD097 === "cut").length,
    },
    legacyD097CutColumns: columns.filter((c) => c.legacyD097 === "cut").map((c) => c.x),
    passesTrueCutGate: byCategory[CATEGORY.C].length === TRUE_CUT_THRESHOLD,
  };
}

/**
 * The report block every tool must emit. Category B is a REQUIRED field, not an optional extra:
 * a caller cannot render a summary that quietly omits it.
 */
export function exposureReport(result) {
  if (!result || !result.byCategory) throw new Error("exposureReport: pass the result of classifyExposure()");
  return {
    rule: "D-098 — classify each fabric top against the mandatory-mask RUN it belongs to",
    threshold: `category ${CATEGORY.C} columns must equal ${TRUE_CUT_THRESHOLD}`,
    trueCutColumns: result.byCategory[CATEGORY.C],
    trueCutCount: result.counts[CATEGORY.C],
    mandatoryRunSilhouetteColumns: result.byCategory[CATEGORY.A],
    mandatoryRunSilhouetteCount: result.counts[CATEGORY.A],
    nonMandatoryFabricColumns: result.byCategory[CATEGORY.B],
    nonMandatoryFabricCount: result.counts[CATEGORY.B],
    nonMandatoryFabricNote: "NOT a garment cut and NOT silhouette — an open question about the fabric mask's shape. Reported separately by contract (D-098).",
    legacyD097CutColumns: result.legacyD097CutColumns,
    legacyD097CutCount: result.counts.legacyD097Cut,
    legacyD097Note: "what the shipped D-097 rule would have called a cut; kept so the regression stays visible",
    passesTrueCutGate: result.passesTrueCutGate,
  };
}
