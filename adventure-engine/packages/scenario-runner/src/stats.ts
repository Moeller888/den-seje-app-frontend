/** Chi-squared goodness-of-fit helpers for the `statistic` scenario step. */

function lnGamma(z: number): number {
  // Lanczos approximation (g = 7, n = 9).
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  const x = z - 1;
  let a = c[0] as number;
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += (c[i] as number) / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized upper incomplete gamma Q(a, x). */
export function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  const gln = lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    let ap = a;
    for (let n = 0; n < 500; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

export interface ChiSquaredResult {
  readonly statistic: number;
  readonly degreesOfFreedom: number;
  readonly p: number;
}

/** Test observed counts against a uniform distribution. */
export function chiSquaredUniform(counts: readonly number[]): ChiSquaredResult {
  const total = counts.reduce((a, b) => a + b, 0);
  const expected = total / counts.length;
  const statistic = counts.reduce((s, o) => s + ((o - expected) * (o - expected)) / expected, 0);
  const degreesOfFreedom = counts.length - 1;
  return { statistic, degreesOfFreedom, p: gammaQ(degreesOfFreedom / 2, statistic / 2) };
}
