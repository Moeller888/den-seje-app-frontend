// Evidence-rule scenarios (±500 window) for the subject level engine. No database, no network.
//
// Usage:  SIM_LIB=1 node docs/placement-sim/gate-scenarios.mjs
//
// Each scenario follows one pupil (300 repetitions) after a placement and reports the mean level after
// 10/30/100/300 answers under five update rules: none (approved §6 step rule alone), hard500 (the first
// proposal), directional, dirrecal (directional + re-calibration) and elo (comparison only). Answers
// past ~100 are dominated by item exhaustion (no repeats), which is itself a finding.
import { bank, idealBank, ENG, HIS, gates, makeAnswer, staircase, eap, cell, clamp } from "./sim.mjs";
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const G = 0.25;
const ans = (S = 600, r = 0) => (T, d) => (rnd() < r ? rnd() < G : rnd() < G + (1 - G) / (1 + Math.exp(-(T - d) / S)));
function nearest(items, used, target) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < items.length; i++) { if (used.has(i)) continue; const dd = Math.abs(items[i].label - target); if (dd < bd) { bd = dd; best = i; } }
  if (best >= 0) used.add(best); return best >= 0 ? items[best] : null;
}
// one continuation trajectory; returns levels at checkpoints
function traj(T, L0, items, A, rule, checkpoints) {
  let L = L0, k = 0; const used = new Set(), out = {}; let moved = 0; const recent = [];
  for (let i = 1; i <= Math.max(...checkpoints); i++) {
    const it = nearest(items, used, L); if (!it) break;
    const ok = A(T, it.d);
    if (rule === "elo") {
      const pe = G + (1 - G) / (1 + Math.exp(-(L - it.label) / 600));
      const K = Math.max(150, 1200 / Math.sqrt(k + 1)); k++; L = clamp(L + K * ((ok ? 1 : 0) - pe)); moved++;
    } else if (rule === "dirrecal") {
      // directional gate + re-calibration: if the last 8 moving answers are far from the 75 % target
      // (>= 7 or <= 3 correct), the step schedule restarts (k = 0 -> step 150 up / 450 down)
      if (gates.directional(it.label, L, ok)) {
        recent.push(ok ? 1 : 0); if (recent.length > 8) recent.shift();
        const c = recent.reduce((a, b) => a + b, 0);
        if (recent.length === 8 && (c >= 7 || c <= 3)) { k = 0; recent.length = 0; }
        const step = Math.max(15, Math.round(150 / Math.sqrt(k + 1))); k++; L = clamp(ok ? L + step : L - 3 * step); moved++;
      }
    } else if (gates[rule](it.label, L, ok)) {
      const step = Math.max(15, Math.round(150 / Math.sqrt(k + 1))); k++; L = clamp(ok ? L + step : L - 3 * step); moved++;
    }
    if (checkpoints.includes(i)) out[i] = L;
  }
  out.moved = moved; return out;
}
function scenario(name, { T, L0, items, S = 600, r = 0, reps = 300, cps = [10, 30, 100, 300] }) {
  console.log(`-- ${name}: true ${T}, start ${L0}` + (r ? `, guesses ${r}` : ""));
  for (const rule of ["none", "hard500", "directional", "dirrecal", "elo"]) {
    seed = 7; const A = ans(S, r); const acc = Object.fromEntries(cps.map((c) => [c, 0])); let mv = 0;
    for (let i = 0; i < reps; i++) { const bk = typeof items === "function" ? items() : items; const o = traj(T, L0, bk, A, rule, cps); cps.forEach((c) => (acc[c] += o[c] ?? NaN)); mv += o.moved; }
    console.log("   " + rule.padEnd(12) + cps.map((c) => `after ${c}: ${Math.round(acc[c] / reps)}`).join("  ") + `  (moving answers of ${Math.max(...cps)}: ${Math.round(mv / reps)})`);
  }
}
const eng = () => bank(ENG, 300), his = () => bank(HIS, 300), ideal = idealBank();
console.log("NOTE: the B3 rule (up s, down 3s) converges where P(correct)=75 %, i.e. about S*ln2 = 416 below T (S=600).");
console.log("      'correct' target for none/hard500/directional is therefore ~T-416; EAP/elo target T.");
scenario("E1 engelsk, pupil placed too high (seed above content)", { T: 2000, L0: 5000, items: eng });
scenario("E2 engelsk, grade-6 seed 4428 above content, average-for-content pupil", { T: 3300, L0: cell(6, 1), items: eng });
scenario("E3 engelsk, strong pupil above the content ceiling", { T: 8000, L0: 3000, items: eng });
scenario("E4 historie, weak pupil placed far too high", { T: 1500, L0: 6000, items: his });
scenario("E5 historie, strong pupil placed far too low (thin grades 3-6)", { T: 7500, L0: 1500, items: his });
scenario("E6 ideal bank, strong pupil placed 2,500 too low", { T: 7000, L0: 4500, items: ideal });
scenario("E7 ideal bank, weak pupil placed 2,500 too high", { T: 2000, L0: 4500, items: ideal });
scenario("E8 ideal bank, correct placement, 20 % guessing", { T: 5000, L0: 4600, items: ideal, r: 0.2 });
scenario("E9 historie, correct placement, label noise 800", { T: 5000, L0: 4600, items: () => bank(HIS, 800) });
