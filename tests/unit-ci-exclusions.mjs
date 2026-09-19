// The ONLY unit-test files that cannot run in CI, and why (D-094).
// ---------------------------------------------------------------------------------------------
// `npm run test:unit` was a LOCAL-only gate from D-085 until D-094: CI ran the change classifier
// and Playwright, never the unit suite. That meant every guarantee the avatar work rests on —
// the D-083 whole-avatar fallback, D-090's per-item gating and mandatory garment layer, the
// D-089 asset SHA pin — was enforced only on one developer's machine, and a regression could
// merge green.
//
// The D-085 record assumed closing that gap was awkward because some tests need a vendored
// libwebp binary. Measured rather than assumed (hide `tools/avatar/vendor/`, run the suite):
// **316 of 328 tests pass without it. Exactly 12 fail, in exactly the two files below.**
// So 96 % of the suite could have run in CI all along.
//
// These two stay local because the vendored binaries are **Windows executables**
// (`cwebp.exe` / `dwebp.exe`, fetched by tools/avatar/fetch-*.mjs) and the runners are Linux.
// Making them run in CI means resolving a platform-specific libwebp inside the audited asset
// tools — a real change to the promotion path, which is its own reviewed piece of work, not a
// side effect of wiring up CI.
//
// They are NOT skipped and NOT weakened: they still run, and still fail loudly, locally.
// A guard test (tests/unit/ci-unit-coverage.test.mjs) asserts this list stays honest — every
// entry must genuinely touch the binaries, and no file outside it may start depending on them.
export const BINARY_DEPENDENT = Object.freeze([
  "avatar-r2-torso-asset-promotion.test.mjs",   // 7 tests: encode/decode the tracked WebP asset
  "avatar-r2-torso-occlusion-mask.test.mjs",    // 5 tests: decode the base, rebuild + compare masks
  "avatar-r2-hair-runtime-asset.test.mjs",      // 16 tests: D-115 gates on decoded runtime pixels
]);

// WHY THE THIRD ENTRY (D-115). The hair acceptance gates now measure the DECODED 512x768 asset,
// which means producing it — cwebp then dwebp — before anything can be judged. That is inherently
// binary-dependent and cannot be otherwise without giving up the thing the decision bought: gates
// that read the image a student sees rather than an intermediate.
//
// It does NOT shrink what CI enforces, because the structural claims are proven twice. Every
// connectivity rule, every gate direction and the "are we measuring the runtime image?"
// counterfactual are also asserted on synthetic fixtures in avatar-r2-hair-candidate-check.test.mjs
// and avatar-r2-hair-alpha-guards.test.mjs, both of which run in CI. The excluded file adds the
// REAL pixels on top: the shipped afro, the codec round-trip, and the Short candidate. The afro
// asset's own SHA pin deliberately lives in avatar-r2-hair-fit-measure.test.mjs, which is a plain
// hash of a tracked file and therefore runs in CI.

// Markers that mean "this file actually drives a vendored binary", used by the guard test.
// `decodePng` / `encodePngRGBA` are pure JS and deliberately NOT on this list — importing a tool
// that merely mentions the vendor path does not make a test binary-dependent.
export const BINARY_MARKERS = Object.freeze([
  "requireDecoder",
  "verifyVendoredDwebp",
  "verifyVendoredCwebp",
  "dwebp.exe",
  "cwebp.exe",
]);
