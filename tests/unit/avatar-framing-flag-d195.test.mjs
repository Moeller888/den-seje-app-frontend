// SHARED UPPER-BODY FRAMING FLAG — D-195: the quiz box and the hub avatar can show one shared upper-body framing (every layer
// box 1.5x about the box's top centre, the box clipping below the hips) — only when AVATAR_FRAMING_UPPER is on or a browser
// opts in with localStorage avatar_framing = "upper". DEFAULT OFF: no class is added and both surfaces render as before.
// The tests pin the flag default, the opt-in semantics, the exact CSS on the two surfaces (and nowhere else), and that the
// surfaces toggle the class from the flag at the start of every render.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AVATAR_FRAMING_UPPER, AVATAR_FRAMING_CLASS, isAvatarFramingUpper } from "../../js/avatar-layers.js";

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

test("both surfaces toggle the class from the flag right after clearing the root, before any layer mounts", () => {
  const app = file("app.js");
  assert.match(app, /import \{[^}]*\bisAvatarFramingUpper, AVATAR_FRAMING_CLASS \} from "\.\/js\/avatar-layers\.js";/);
  assert.match(app, /avatarDisplay\.innerHTML = "";\n    \/\/ D-195[^\n]*\n    avatarDisplay\.classList\.toggle\(AVATAR_FRAMING_CLASS, isAvatarFramingUpper\(\)\);\n/);
  const hub = file("hub.html");
  assert.match(hub, /import \{[^}]*\bisAvatarFramingUpper, AVATAR_FRAMING_CLASS \} from "\.\/js\/avatar-layers\.js";/);
  assert.match(hub, /avatarEl\.innerHTML = "";\n    \/\/ D-195[^\n]*\n    avatarEl\.classList\.toggle\(AVATAR_FRAMING_CLASS, isAvatarFramingUpper\(\)\);\n/);
  assert.equal((app.match(/classList\.toggle\(AVATAR_FRAMING_CLASS/g) || []).length, 1);
  assert.equal((hub.match(/classList\.toggle\(AVATAR_FRAMING_CLASS/g) || []).length, 1);
});
