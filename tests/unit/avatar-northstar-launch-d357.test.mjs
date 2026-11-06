// D-357: the Northstar wardrobe for every pupil, chosen freely and stored on the account.
//   1. The flag is on, and a pupil with no stored choice stays on today's avatar: nobody is moved without choosing.
//   2. Once a surface has named the account, the choice comes from the account and never from this browser, which is what
//      keeps pupils on a shared school computer apart.
//   3. The page reads the account first and saves through the RPC. The wardrobe itself is tested in the D-359 file.
// The migration has its own test: avatar-northstar-choice-migration-d357.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const fresh = async () => import("../../js/avatar-layers.js?d357=" + Math.random());
const withStorage = (values, fn) => {
  const map = new Map(Object.entries(values));
  const prev = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
  try { return fn(map); } finally { globalThis.localStorage = prev; }
};

test("D-357: the flag is on, and a pupil without a stored choice keeps today's avatar", async () => {
  const L = await fresh();
  assert.equal(L.AVATAR_NORTHSTAR_WARDROBE, true);
  assert.equal(L.isNorthstarWardrobeOn(), true);
  L.northstarUseAccount({ v: 1, body_type: "neutral" });
  assert.equal(withStorage({}, () => L.northstarRenderFor("avatar", [])), null);
  for (const bad of [null, undefined, "x", 7, { northstar: null }, { northstar: [] }, { northstar: "K01" }]) {
    L.northstarUseAccount(bad);
    assert.equal(withStorage({}, () => L.northstarRenderFor("hub", [])), null, "malformed identity = no choice");
  }
});

test("D-357: the account decides, never the browser, so a shared computer keeps pupils apart", async () => {
  const L = await fresh();
  const previousPupil = { avatar_northstar_outfit: "K05", avatar_northstar_tee: "TP-TEA-CRM" };
  L.northstarUseAccount({ v: 1, body_type: "neutral" });
  assert.equal(withStorage(previousPupil, () => L.northstarRenderFor("quiz", [])), null, "a browser's outfit is not this pupil's");
  L.northstarUseAccount({ v: 1, body_type: "neutral", northstar: { outfit: "K01" } });
  const r = withStorage(previousPupil, () => L.northstarRenderFor("quiz", []));
  assert.equal(r.outfit, "K01"); assert.equal(r.tee, null, "the browser's print tee is not added");
});

test("D-357: stored ids still pass every approval gate; unknown ids and unsupported equipment keep today's avatar", async () => {
  const L = await fresh();
  L.northstarUseAccount({ northstar: { outfit: "K99" } });
  assert.equal(withStorage({}, () => L.northstarRenderFor("avatar", [])), null);
  L.northstarUseAccount({ northstar: { outfit: "K01", tee: "not-an-item", shoes: "not-an-item", top: "not-an-item", pants: "not-an-item" } });
  assert.equal(withStorage({}, () => L.northstarRenderFor("avatar", [])).key, "K01");
  L.northstarUseAccount({ northstar: { outfit: "K01" } });
  assert.equal(withStorage({}, () => L.northstarRenderFor("avatar", [{ src: "/x.svg", z: 5, slot: "hat" }])), null, "a hat falls back, whole");
  assert.equal(withStorage({}, () => L.northstarRenderFor("shop", [])), null, "only the three surfaces show the figure");
});

test("D-357: the page reads the account before the wardrobe, and the renderer names the account before it decides", () => {
  const H = read("avatar.html");
  assert.ok(H.indexOf("await loadAll();") < H.indexOf('import("./js/avatar-northstar-panel.js")'), "the wardrobe waits for the profile");
  assert.match(H, /supabase\.rpc\("set_avatar_northstar", \{ p_choice: choice \}\)/);
  const R = read("js/avatar-render-c2.js");
  assert.ok(R.indexOf("northstarUseAccount(identity)") < R.indexOf("northstarRenderFor(surface, cosmetics)", R.indexOf("northstarUseAccount(identity)") - 1));
});
