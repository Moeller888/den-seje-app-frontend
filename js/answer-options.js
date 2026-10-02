// Choice-option preparation for the quiz renderer (app.js).
//
// Legacy padding: plain multiple choice (answer_format exactly "mc") has always been topped up to
// four options from a pool of WWII years, then shuffled. Every active "mc" question already has
// four distinct options, so for them the padding adds nothing and only the shuffle is visible.
// That behaviour is kept unchanged here.
//
// The padding is restricted to answer_format "mc" on purpose: a two-choice task (true/false) or
// any other choice format must never receive random years. New choice formats get their own
// answer_format and are returned as authored — de-duplicated, never padded.

export const LEGACY_MC_PAD_POOL = Object.freeze(["1939", "1940", "1941", "1942", "1943", "1944", "1945", "1946"]);

export function shouldPadToFour(answerFormat) {
  return typeof answerFormat === "string" && answerFormat.trim().toLowerCase() === "mc";
}

// rng is injectable for tests; production uses Math.random exactly as before.
export function ensureFourOptions(options, rng = Math.random) {
  const unique = new Set(Array.isArray(options) ? options : []);

  while (unique.size < 4) {
    const random = LEGACY_MC_PAD_POOL[Math.floor(rng() * LEGACY_MC_PAD_POOL.length)];
    unique.add(random);
  }

  return Array.from(unique).sort(() => rng() - 0.5);
}

export function prepareChoiceOptions(options, answerFormat, rng = Math.random) {
  const list = Array.isArray(options) ? options : [];
  if (shouldPadToFour(answerFormat)) return ensureFourOptions(list, rng);
  return Array.from(new Set(list));
}
