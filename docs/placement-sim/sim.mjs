// Deterministic sensitivity study for subject placement. No database, no network.
//
// Usage:  node docs/placement-sim/sim.mjs            (N=3000 pupils per row; N=2000 node ... is faster)
//         OFFSET=416 node docs/placement-sim/sim.mjs (error measured against the B3 75 % target level)
//
// WHAT THIS IS — AND IS NOT. It compares placement METHODS under stated, uncalibrated assumptions. No
// number here is the real precision of a placement: the response model, the slope S and the item
// difficulties are assumptions, and the live answers show that band labels predict little within one
// pupil (docs/subject-placement-design.md §15). The banks are the active MC counts per (grade, band)
// read read-only on 2026-10-28; no question text, keys or pupil data.
// Response model (assumed, NOT calibrated): P(correct) = r*G + (1-r)*(G + (1-G)/(1+exp(-(T-d)/S)))
//   G = 0.25 (4-option MC), S = levels per logit, r = share of answers that are pure guesses.
// d = an item's TRUE difficulty; the engine only sees its LABEL (cell midpoint of target_grade x band).
let seed = 20261028;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const G = 0.25, clamp = (x) => Math.max(1, Math.min(10000, Math.round(x)));
const cell = (g, b) => Math.round(((g - 3) * 5 + (b - 1) + 0.5) * 10000 / 35);

// ---- item banks: real active MC counts per (grade, band), 2026-10-28 ----
const ENG = { 3: [94, 93, 91, 85], 4: [92, 92, 91, 88], 5: [91, 92, 92, 89] };
const HIS = { 3: [10, 8, 8, 5], 4: [17, 16, 13, 12], 5: [12, 14, 14, 10], 6: [12, 14, 14, 10],
  7: [63, 79, 84, 62, 13], 8: [54, 54, 70, 43, 3], 9: [13, 13, 13, 28, 228] };
// labelNoise: SD (levels) between an item's label and its true difficulty.
function bank(counts, labelNoise) {
  const items = [];
  for (const [g, arr] of Object.entries(counts)) arr.forEach((n, i) => {
    for (let k = 0; k < n; k++) { const label = cell(+g, i + 1); items.push({ label, d: label + labelNoise * gauss() }); }
  });
  return items;
}
function idealBank() { const items = []; for (let l = 50; l <= 10000; l += 25) items.push({ label: l, d: l }); return items; }

function makeAnswer(S, r) {
  return (T, d) => (rnd() < r ? rnd() < G : rnd() < G + (1 - G) / (1 + Math.exp(-(T - d) / S)));
}
// nearest unused item to a target label (deterministic tie-break: lower index)
function pick(items, used, target) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < items.length; i++) { if (used.has(i)) continue; const dd = Math.abs(items[i].label - target); if (dd < bd) { bd = dd; best = i; } }
  if (best >= 0) used.add(best);
  return best >= 0 ? items[best] : null;
}

// ---- placement methods ----
// today's fixed test: 3+3+2+2 items, bands 1-4, random grade 3..own grade, score -> band 1-4 at own grade
function fixedTest(T, grade, items, ans) {
  let score = 0;
  for (const [b, n] of [[1, 3], [2, 3], [3, 2], [4, 2]]) for (let i = 0; i < n; i++) {
    const g = 3 + Math.floor(rnd() * (grade - 2));
    const cand = items.filter((it) => it.label === cell(g, b));
    const it = cand.length ? cand[Math.floor(rnd() * cand.length)] : null;
    if (it && ans(T, it.d)) score += b;
  }
  const band = score >= 18 ? 4 : score >= 12 ? 3 : score >= 6 ? 2 : 1;
  return { L: cell(grade, band), n: 10 };
}
// gate(q, L, ok): does this answer move the level? and in which direction
const gates = {
  none: () => true,
  hard500: (q, L) => Math.abs(q - L) <= 500,
  directional: (q, L, ok) => Math.abs(q - L) <= 500 || (q < L && !ok) || (q > L && ok),
};
// weighted staircase (B3: up s, down 3s), s halves at each reversal; stop: minN..maxN, s<=sMin & >=4 reversals
function staircase(T, start, items, ans, { minN = 8, maxN = 15, s0 = 600, sMin = 100, gate = gates.hard500, fixedN = 0 } = {}) {
  let L = start, s = s0, last = null, rev = [], n = 0; const used = new Set();
  while (n < (fixedN || maxN)) {
    const it = pick(items, used, L); if (!it) break;
    const ok = ans(T, it.d); n++;
    if (gate(it.label, L, ok)) {
      const dir = ok ? 1 : -1;
      if (last !== null && dir !== last) { rev.push(L); s = Math.max(sMin, s / 2); }
      last = dir; L = clamp(L + (ok ? s : -3 * s));
    }
    if (!fixedN && n >= minN && s <= sMin && rev.length >= 4) break;
  }
  const est = rev.length >= 2 ? Math.round(rev.slice(-4).reduce((a, b) => a + b, 0) / Math.min(4, rev.length)) : L;
  return { L: est, n, used };
}
// Bayesian EAP on a grid with the ASSUMED model (S=600, no guess share); stop when posterior SD <= sdStop or maxN
function eap(T, start, items, ans, { sdStop = 500, minN = 6, maxN = 20, priorSd = 2000 } = {}) {
  const grid = []; for (let l = 1; l <= 10000; l += 50) grid.push(l);
  let w = grid.map((l) => Math.exp(-0.5 * ((l - start) / priorSd) ** 2));
  const used = new Set(); let n = 0, mean = start, sd = priorSd;
  const stats = () => { const z = w.reduce((a, b) => a + b, 0); mean = grid.reduce((a, l, i) => a + l * w[i], 0) / z; sd = Math.sqrt(grid.reduce((a, l, i) => a + (l - mean) ** 2 * w[i], 0) / z); };
  stats();
  while (n < maxN) {
    const it = pick(items, used, mean); if (!it) break;
    const ok = ans(T, it.d); n++;
    w = w.map((wi, i) => { const p = G + (1 - G) / (1 + Math.exp(-(grid[i] - it.label) / 600)); return wi * (ok ? p : 1 - p); });
    stats();
    if (n >= minN && sd <= sdStop) break;
  }
  return { L: Math.round(mean), n, used, sd };
}
// ---- continuation after placement: approved §6 step rule (B3), with a gate, or an expected-score (Elo-like) update ----
function continueRule(T, L0, items, ans, n, used, { gate = gates.hard500, rule = "b3" } = {}) {
  let L = L0, k = 0; used = used ?? new Set();
  for (let i = 0; i < n; i++) {
    const it = pick(items, used, L); if (!it) break;
    const ok = ans(T, it.d);
    if (rule === "elo") {
      const pe = G + (1 - G) / (1 + Math.exp(-(L - it.label) / 600));
      const K = Math.max(150, 1200 / Math.sqrt(k + 1)); k++;
      L = clamp(L + K * ((ok ? 1 : 0) - pe));
      continue;
    }
    if (!gate(it.label, L, ok)) continue;
    const step = Math.max(15, Math.round(150 / Math.sqrt(k + 1))); k++;
    L = clamp(ok ? L + step : L - 3 * step);
  }
  return L;
}

// ---- metrics ----
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function summarise(errs, ns) {
  const abs = errs.map(Math.abs);
  return { MAE: Math.round(abs.reduce((a, b) => a + b, 0) / abs.length), median: q(abs, 0.5), p90: q(abs, 0.9),
    bias: Math.round(errs.reduce((a, b) => a + b, 0) / errs.length), items: ns ? +(ns.reduce((a, b) => a + b, 0) / ns.length).toFixed(1) : undefined };
}
// pupils: grade 3..9, true level ~ Normal(grade mid, sdT); grade mid = cell(grade, 2.5)
const N = +(process.env.N ?? 3000);
function pupils(sdT = 1200, grades = [3, 4, 5, 6, 7, 8, 9]) {
  const out = []; for (let i = 0; i < N; i++) { const grade = grades[i % grades.length]; out.push({ grade, T: clamp((cell(grade, 2) + cell(grade, 3)) / 2 + sdT * gauss()) }); }
  return out;
}
function run(label, { items, S = 600, r = 0, sdT = 1200, grades, method, cont = 0, contOpts = {} }) {
  seed = 20261028; const ans = makeAnswer(S, r); const P = pupils(sdT, grades);
  const errs = [], ns = [], byBucket = { weak: [], mid: [], strong: [] };
  for (const { grade, T } of P) {
    const bk = typeof items === "function" ? items() : items;
    const start = cell(grade, 1);
    const res = method(T, start, bk, ans, grade);
    let L = res.L; if (cont) L = continueRule(T, L, bk, ans, cont, res.used, contOpts);
    const e = L - (T - (+process.env.OFFSET || 0)); errs.push(e); ns.push(res.n);
    const rel = T - (cell(grade, 2) + cell(grade, 3)) / 2;
    (rel < -1500 ? byBucket.weak : rel > 1500 ? byBucket.strong : byBucket.mid).push(e);
  }
  const s = summarise(errs, ns);
  const b = Object.fromEntries(Object.entries(byBucket).map(([k, v]) => [k, v.length ? summarise(v).MAE : null]));
  console.log(label.padEnd(58), JSON.stringify({ ...s, weakMAE: b.weak, midMAE: b.mid, strongMAE: b.strong }));
}
export { run, bank, idealBank, ENG, HIS, staircase, eap, fixedTest, gates, continueRule, makeAnswer, cell, clamp };

if (process.env.SIM_LIB !== "1") {
  const ideal = idealBank();
  const fixed = (T, start, items, ans, grade) => fixedTest(T, grade, items, ans);
  const sc = (o = {}) => (T, start, items, ans) => staircase(T, start, items, ans, o);
  const ea = (o = {}) => (T, start, items, ans) => eap(T, start, items, ans, o);
  console.log("== A. ideal bank (every level available, label = true difficulty), S=600, no guessing, N=" + N);
  run("A1 today's fixed 10-item test", { items: ideal, method: fixed });
  for (const n of [8, 10, 12, 15, 20, 30]) run(`A2 staircase fixed ${n} items`, { items: ideal, method: sc({ fixedN: n }) });
  run("A3 staircase adaptive 8-15", { items: ideal, method: sc() });
  run("A4 staircase adaptive 8-15 + 30 §6 answers", { items: ideal, method: sc(), cont: 30 });
  run("A5 no placement, §6 only, 30 answers", { items: ideal, method: (T, s) => ({ L: s, n: 0 }), cont: 30 });
  run("A6 no placement, §6 only, 100 answers", { items: ideal, method: (T, s) => ({ L: s, n: 0 }), cont: 100 });
  for (const sd of [700, 500, 350]) run(`A7 EAP stop SD<=${sd} (6-20)`, { items: ideal, method: ea({ sdStop: sd }) });
  console.log("== B. guessing sensitivity (ideal bank), r = share of pure guesses");
  for (const r of [0.1, 0.2, 0.4]) {
    run(`B r=${r} fixed test`, { items: ideal, r, method: fixed });
    run(`B r=${r} staircase 8-15`, { items: ideal, r, method: sc() });
    run(`B r=${r} EAP SD<=500`, { items: ideal, r, method: ea() });
  }
  console.log("== C. model misspecification: true S differs from the assumed 600");
  for (const S of [300, 1000, 1500]) { run(`C S=${S} staircase 8-15`, { items: ideal, S, method: sc() }); run(`C S=${S} EAP SD<=500`, { items: ideal, S, method: ea() }); }
  console.log("== D. real banks (counts per cell), labels = cell midpoints; label noise = SD of true vs label");
  for (const noise of [0, 300, 800]) {
    run(`D engelsk (grades 3-5 pupils) noise ${noise} staircase 8-15`, { items: () => bank(ENG, noise), grades: [3, 4, 5], method: sc() });
    run(`D engelsk (grades 6-9 pupils) noise ${noise} staircase 8-15`, { items: () => bank(ENG, noise), grades: [6, 7, 8, 9], method: sc() });
    run(`D engelsk (grades 6-9) noise ${noise} staircase, directional gate`, { items: () => bank(ENG, noise), grades: [6, 7, 8, 9], method: sc({ gate: gates.directional }) });
    run(`D historie (all grades) noise ${noise} staircase 8-15`, { items: () => bank(HIS, noise), method: sc() });
    run(`D historie (all grades) noise ${noise} EAP SD<=500`, { items: () => bank(HIS, noise), method: ea() });
  }
}
