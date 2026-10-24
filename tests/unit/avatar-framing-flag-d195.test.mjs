// SHARED UPPER-BODY FRAMING FLAG — D-195: the quiz box and the hub avatar can show one shared upper-body framing (every layer
// box 1.5x about the box's top centre, the box clipping below the hips) — only when AVATAR_FRAMING_UPPER is on or a browser
// opts in with localStorage avatar_framing = "upper". DEFAULT OFF: no class is added and both surfaces render as before.
// The tests pin the flag default, the opt-in semantics, the exact CSS on the two surfaces (and nowhere else), and that the
// surfaces toggle the class before mounting. D-196: the framing adapts to what the avatar wears — a wide-slot item (wings,
// capes: drawn across the whole canvas) keeps today's whole-canvas view, so nothing of it is lost.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AVATAR_FRAMING_UPPER, AVATAR_FRAMING_CLASS, isAvatarFramingUpper, AVATAR_FRAMING_WIDE_SLOTS, avatarFramingOnFor } from "../../js/avatar-layers.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")), "utf8");
const withStorage = (store, fn) => { const had = Object.prototype.hasOwnProperty.call(globalThis, "localStorage"), old = globalThis.localStorage; globalThis.localStorage = store; try { return fn(); } finally { if (had) globalThis.localStorage = old; else delete globalThis.localStorage; } };

test("the flag is OFF by default and the class name is fixed", () => {
  assert.equal(AVATAR_FRAMING_UPPER, false, "default OFF — the active quiz and hub are unchanged");
  assert.equal(AVATAR_FRAMING_CLASS, "avatar-framing-upper");
  assert.equal(typeof globalThis.localStorage, "undefined");
  assert.equal(isAvatarFramingUpper(), false, "no localStorage → off");
});

test("per-browser opt-in: only avatar_framing === 'upper' turns it on; anything else or a throwing storage is off", () => {
  const store = (v) => ({ getItem: (k) => (k === "avatar_framing" ? v : null) });
  assert.equal(withStorage(store("upper"), isAvatarFramingUpper), true);
  for (const v of [null, "", "1", "true", "UPPER", "full"]) assert.equal(withStorage(store(v), isAvatarFramingUpper), false, String(v));
  assert.equal(withStorage({ getItem: () => { throw new Error("blocked"); } }, isAvatarFramingUpper), false);
});

test("the quiz CSS: overflow clipped, every layer box 1.5x about the top centre, the inline-positioned blink layer too", () => {
  const html = file("index.html");
  assert.ok(html.includes("    #avatar-display.avatar-framing-upper { overflow: hidden; }\n"));
  assert.ok(html.includes("    #avatar-display.avatar-framing-upper .quiz-avatar-layer { left: -25%; width: 150%; height: 150%; }\n"));
  assert.ok(html.includes("    #avatar-display.avatar-framing-upper #avatar-blink-layer { left: -25% !important; width: 150% !important; height: 150% !important; }\n"));
  // the base rules are untouched: the framing only ever applies under the class
  assert.match(html, /\n    #avatar-display \{\n[\s\S]*?overflow: visible;/);
  assert.match(html, /\n    \.quiz-avatar-layer \{\n      position: absolute;\n      top: 0; left: 0;\n      width: 100%; height: 100%;\n      object-fit: contain;/);
});

test("the hub CSS: the same framing for the base stack and the expression overlay's class, the blink layer too", () => {
  const html = file("hub.html");
  assert.ok(html.includes("    .profile-avatar.avatar-framing-upper { overflow: hidden; }\n"));
  assert.ok(html.includes("    .profile-avatar.avatar-framing-upper .profile-avatar-layer,\n    .profile-avatar.avatar-framing-upper .quiz-avatar-layer { left: -25%; width: 150%; height: 150%; }\n"));
  assert.ok(html.includes("    .profile-avatar.avatar-framing-upper #avatar-blink-layer { left: -25% !important; width: 150% !important; height: 150% !important; }\n"));
});

test("one shared geometry: left = -(k - 1) / 2 for k = 1.5 on both surfaces; no other surface carries the framing", () => {
  const k = 1.5; assert.equal(Math.round(-(k - 1) / 2 * 100), -25); assert.equal(Math.round(k * 100), 150);
  // the browser verifier (tools/avatar/verify-framing-d195.mjs) reads the factor the checkout ships, never a hard-coded one
  assert.ok(file("tools/avatar/verify-framing-d195.mjs").includes("export function shippedScale("));
  for (const f of ["avatar.html", "collection.html", "shop.html", "style.css", "css/theme.css"]) assert.ok(!file(f).includes("avatar-framing-upper"), f + " untouched");
  // selector lines only (the explaining comment names the class too)
  const count = (s) => (s.match(/^ {4}[#.][\w-]+\.avatar-framing-upper\b/gm) || []).length;
  assert.equal(count(file("index.html")), 3);
  assert.equal(count(file("hub.html")), 4);
});

// The guarded toggle sits right before the mount, after the cosmetics are composed, and decides from the MOUNTED cosmetics.
const GUARD = (root) => new RegExp(`const cosmetics = c2CosmeticLayers\\([^\\n]*\\n(?:      //[^\\n]*\\n)+      (if \\(typeof avatarLayersModule\\.avatarFramingOnFor === "function"\\) ${root}\\.classList\\.toggle\\(avatarLayersModule\\.AVATAR_FRAMING_CLASS, avatarLayersModule\\.avatarFramingOnFor\\(Object\\.fromEntries\\(cosmetics\\.map\\(\\(c\\) => \\[c\\.slot, true\\]\\)\\)\\) === true\\);)\\n      const renderPath = await mountC2Avatar\\(${root}, `);

test("both surfaces toggle the class from the mounted cosmetics right before the mount", () => {
  for (const [f, root] of [["app.js", "avatarDisplay"], ["hub.html", "avatarEl"]]) {
    const src = file(f);
    assert.match(src, /import \* as avatarLayersModule from "\.\/js\/avatar-layers\.js";/, f + ": namespace import");
    assert.match(src, GUARD(root), f + ": the guarded toggle right before mountC2Avatar");
    assert.equal((src.match(/classList\.toggle\(avatarLayersModule\.AVATAR_FRAMING_CLASS/g) || []).length, 1, f);
    assert.ok(!/isAvatarFramingUpper\(\)/.test(src), f + ": no slot-blind toggle left");
  }
});

test("D-196 tier: framing only with the flag AND no wide-slot (back) item; aura, headwear and hair keep the framing", () => {
  assert.deepEqual([...AVATAR_FRAMING_WIDE_SLOTS], ["back"]);
  assert.equal(avatarFramingOnFor({}), false, "flag off → never");
  assert.equal(avatarFramingOnFor({ headwear: "crown" }), false, "flag off → never");
  const on = { getItem: (k) => (k === "avatar_framing" ? "upper" : null) };
  const cases = [[{}, true], [null, true], ["junk", true], [{ headwear: "crown" }, true], [{ aura: "gold" }, true], [{ back: "wings" }, false], [{ back: "cape", headwear: "crown" }, false], [{ aura: "gold", back: "wings" }, false], [{ back: null }, true], [{ back: "" }, true]];
  for (const [slots, want] of cases) assert.equal(withStorage(on, () => avatarFramingOnFor(slots)), want, JSON.stringify(slots));
});

test("deploy skew: no NAMED import of the framing exports (a module SyntaxError against an older avatar-layers.js), and the guard keeps an older module off", () => {
  for (const f of ["app.js", "hub.html"]) {
    for (const m of file(f).matchAll(/import \{([^}]*)\} from "\.\/js\/avatar-layers\.js";/g)) assert.ok(!/\b(isAvatarFramingUpper|AVATAR_FRAMING_CLASS|avatarFramingOnFor|AVATAR_FRAMING_WIDE_SLOTS)\b/.test(m[1]), f + ": framing names only via the namespace");
  }
  // run the exact guard line from each surface against three module shapes
  for (const [f, root] of [["app.js", "avatarDisplay"], ["hub.html", "avatarEl"]]) {
    const line = file(f).match(GUARD(root))[1];
    const run = (ns, cosmetics = []) => { const calls = []; const el = { classList: { toggle: (c, on) => calls.push([c, on]) } }; new Function("avatarLayersModule", root, "cosmetics", line)(ns, el, cosmetics); return calls; };
    assert.deepEqual(run({}), [], f + ": an older module without the function → no class, no error");
    assert.deepEqual(run({ AVATAR_FRAMING_CLASS, isAvatarFramingUpper: () => true }), [], f + ": a D-195 module (no avatarFramingOnFor) → no class");
    const ns = (flag) => ({ AVATAR_FRAMING_CLASS, avatarFramingOnFor: (slots) => withStorage({ getItem: () => (flag ? "upper" : null) }, () => avatarFramingOnFor(slots)) });
    assert.deepEqual(run(ns(false)), [[AVATAR_FRAMING_CLASS, false]], f + ": flag off → class removed");
    assert.deepEqual(run(ns(true)), [[AVATAR_FRAMING_CLASS, true]], f + ": opt-in, nothing worn → framed");
    assert.deepEqual(run(ns(true), [{ slot: "headwear", src: "/h.svg", z: 1 }, { slot: "aura", src: "/a.svg", z: -2 }]), [[AVATAR_FRAMING_CLASS, true]], f + ": headwear + aura → framed");
    assert.deepEqual(run(ns(true), [{ slot: "back", src: "/w.svg", z: -1 }]), [[AVATAR_FRAMING_CLASS, false]], f + ": wings/cape mounted → today's view");
  }
});
