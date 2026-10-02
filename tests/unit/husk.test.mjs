import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BOARDS, GLYPH_COUNT, boardFor, missLimit, deal, flipTile, closePair } from "../../js/husk-logic.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");

function counts(tiles) {
  const c = new Map();
  for (const t of tiles) c.set(t.glyph, (c.get(t.glyph) || 0) + 1);
  return c;
}

test("the board grows 12 → 16 → 20 tiles and then stays at 20", () => {
  assert.deepEqual([0, 1, 2, 3, 9].map((l) => boardFor(l).pairs * 2), [12, 16, 20, 20, 20]);
  assert.equal(boardFor(-1).pairs, 6);
  assert.equal(boardFor(Number.NaN).pairs, 6);
  for (const b of BOARDS) assert.equal((b.pairs * 2) % b.cols, 0, "every board fills whole rows");
  assert.ok(GLYPH_COUNT >= BOARDS[BOARDS.length - 1].pairs);
});

test("one miss is allowed per pair", () => {
  assert.equal(missLimit(0), 6);
  assert.equal(missLimit(1), 8);
  assert.equal(missLimit(2), 10);
});

test("a dealt board holds every glyph exactly twice, all face down", () => {
  for (const level of [0, 1, 2]) {
    const tiles = deal(level, 5);
    assert.equal(tiles.length, boardFor(level).pairs * 2);
    for (const [, n] of counts(tiles)) assert.equal(n, 2);
    assert.ok(tiles.every((t) => !t.open && !t.matched));
  }
});

test("dealing is deterministic per seed, and a new seed deals a new board", () => {
  assert.deepEqual(deal(1, 42), deal(1, 42));
  assert.notDeepEqual(deal(0, 1).map((t) => t.glyph), deal(0, 2).map((t) => t.glyph));
  assert.doesNotThrow(() => deal(0, undefined));
  assert.doesNotThrow(() => deal("x", -7));
});

test("two alike are matched, and the last pair solves the board", () => {
  let tiles = deal(0, 3);
  const first = tiles.findIndex((t) => t.glyph === 0);
  const second = tiles.findIndex((t, i) => i !== first && t.glyph === 0);
  const a = flipTile(tiles, null, first);
  assert.equal(a.kind, "first");
  const b = flipTile(a.tiles, first, second);
  assert.equal(b.kind, "match");
  assert.ok(b.tiles[first].matched && b.tiles[second].matched);
  assert.equal(b.solved, false);
  assert.equal(tiles[first].open, false, "the input is not changed");

  tiles = b.tiles;
  for (let g = 1; g < boardFor(0).pairs; g++) {
    const i = tiles.findIndex((t) => t.glyph === g);
    const j = tiles.findIndex((t, k) => k !== i && t.glyph === g);
    tiles = flipTile(tiles, null, i).tiles;
    const r = flipTile(tiles, i, j);
    tiles = r.tiles;
    assert.equal(r.solved, g === boardFor(0).pairs - 1);
  }
});

test("two different are a miss and turn back with closePair", () => {
  const tiles = deal(0, 9);
  const i = 0;
  const j = tiles.findIndex((t) => t.glyph !== tiles[0].glyph);
  const r = flipTile(flipTile(tiles, null, i).tiles, i, j);
  assert.equal(r.kind, "miss");
  assert.ok(r.tiles[i].open && r.tiles[j].open);
  const closed = closePair(r.tiles, i, j);
  assert.ok(!closed[i].open && !closed[j].open);
});

test("flipping a bad, open or matched tile does nothing", () => {
  const tiles = deal(0, 1);
  assert.equal(flipTile(tiles, null, -1).kind, "invalid");
  assert.equal(flipTile(tiles, null, 99).kind, "invalid");
  assert.equal(flipTile(tiles, null, 1.5).kind, "invalid");
  assert.equal(flipTile(null, null, 0).kind, "invalid");
  const up = flipTile(tiles, null, 0).tiles;
  assert.equal(flipTile(up, 0, 0).kind, "invalid");
});

test("the Husk page is internal, pays nothing and goes back to the menu", () => {
  const page = read("husk.html");
  assert.match(page, /noindex/);
  assert.match(page, /href="spil\.html"/);
  assert.match(page, /src="js\/husk\.js"/);
  const js = read("js/husk.js");
  assert.equal(js.includes(".rpc("), false, "Husk pays no coins");
  assert.doesNotMatch(js, /Math\.random\s*\(/);
});
