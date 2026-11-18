// Module-loader hook for tools/e2e-safety/mutate-guards.mjs: serves the IN-MEMORY mutated source for
// exactly one module URL. Every other module loads normally. Nothing is written to disk.
let target = null;
let source = null;

export async function initialize(data) {
  target = data?.url ?? null;
  source = data?.source ?? null;
}

export async function load(url, context, nextLoad) {
  if (target !== null && url.split("?")[0] === target) {
    return { format: "module", source, shortCircuit: true };
  }
  return nextLoad(url, context);
}
