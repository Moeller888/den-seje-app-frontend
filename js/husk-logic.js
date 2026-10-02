// Husk — pure board logic. No DOM, no rewards.
// Flip two tiles. Two alike stay open; two different turn back over and count as a miss.
// Each cleared board deals a bigger one: 12, then 16, then 20 tiles, and 20 from then on.

// One entry per board size. `cols` is the grid width the page draws it with.
export const BOARDS = Object.freeze([
  Object.freeze({ pairs: 6, cols: 4 }),
  Object.freeze({ pairs: 8, cols: 4 }),
  Object.freeze({ pairs: 10, cols: 5 }),
]);

// Distinct tile marks. The biggest board needs one per pair.
export const GLYPH_COUNT = 10;

const MODULUS = 2147483647;
const MULTIPLIER = 48271;

/**
 * Board size for a level. Levels below 0 or non-numbers count as 0; past the last size it stays there.
 * @param {number} level
 * @returns {{pairs:number, cols:number}}
 */
export function boardFor(level) {
  const n = Math.floor(Number(level));
  const i = Number.isFinite(n) && n > 0 ? Math.min(n, BOARDS.length - 1) : 0;
  return BOARDS[i];
}

/**
 * Misses allowed on one board before the round ends: one per pair.
 * @param {number} level
 * @returns {number}
 */
export function missLimit(level) {
  return boardFor(level).pairs;
}

/**
 * A shuffled board. Deterministic: the same level and seed always deal the same board,
 * and a different seed deals a different one. No Math.random.
 * @param {number} level
 * @param {number} seed  any integer, e.g. how many rounds this browser has played
 * @returns {{glyph:number, open:boolean, matched:boolean}[]}
 */
export function deal(level, seed) {
  const { pairs } = boardFor(level);
  const lvl = Math.max(0, Math.floor(Number(level)) || 0);
  const sd = Math.abs(Math.floor(Number(seed)) || 0);
  const glyphs = [];
  for (let g = 0; g < pairs; g++) glyphs.push(g, g);
  let s = ((sd % 100000) * 7919 + lvl + 3) * 104729 % MODULUS;
  if (s <= 0) s += MODULUS - 1;
  for (let i = glyphs.length - 1; i > 0; i--) {
    s = (s * MULTIPLIER) % MODULUS;
    const j = s % (i + 1);
    const tmp = glyphs[i];
    glyphs[i] = glyphs[j];
    glyphs[j] = tmp;
  }
  return glyphs.map((glyph) => ({ glyph, open: false, matched: false }));
}

/**
 * What flipping `index` does, given the tile already turned up (`openIndex`, or null).
 * Returns the new tiles; the input array is never changed.
 *   invalid — nothing happens (bad index, tile already up or already matched)
 *   first   — the first tile of a pair is now up
 *   match   — the two are alike and stay up as matched
 *   miss    — the two differ; both are up now and must be turned back with closePair()
 * @param {{glyph:number, open:boolean, matched:boolean}[]} tiles
 * @param {number|null} openIndex
 * @param {number} index
 * @returns {{kind:"invalid"|"first"|"match"|"miss", tiles:{glyph:number, open:boolean, matched:boolean}[], solved:boolean}}
 */
export function flipTile(tiles, openIndex, index) {
  const list = Array.isArray(tiles) ? tiles : [];
  const invalid = { kind: "invalid", tiles: list, solved: false };
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return invalid;
  const tile = list[index];
  if (!tile || tile.open || tile.matched) return invalid;

  const hasOpen = Number.isInteger(openIndex) && openIndex >= 0 && openIndex < list.length
    && openIndex !== index && list[openIndex] && list[openIndex].open && !list[openIndex].matched;
  const next = list.map((t, i) => (i === index ? { ...t, open: true } : t));
  if (!hasOpen) return { kind: "first", tiles: next, solved: false };

  const first = next[openIndex];
  const second = next[index];
  if (first.glyph === second.glyph) {
    next[openIndex] = { ...first, matched: true };
    next[index] = { ...second, matched: true };
    return { kind: "match", tiles: next, solved: next.every((t) => t.matched) };
  }
  return { kind: "miss", tiles: next, solved: false };
}

/**
 * Turns the two tiles of a missed pair face down again.
 * @param {{glyph:number, open:boolean, matched:boolean}[]} tiles
 * @param {number} a
 * @param {number} b
 */
export function closePair(tiles, a, b) {
  const list = Array.isArray(tiles) ? tiles : [];
  return list.map((t, i) => ((i === a || i === b) && t && !t.matched ? { ...t, open: false } : t));
}
