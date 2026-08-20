// Section 155E — the hair-colour picker. 155E shipped the data contract (palette,
// tokens, RPC parameter, both render paths) but never a control, so every student
// rendered the default `brown` because nothing could write the value. These tests lift
// the real functions out of avatar.html and run them against a stub DOM and a recording
// RPC stub, so they prove what the page does rather than that a string is present.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { HAIR_COLORS, HAIR_COLOR_TOKENS, DEFAULT_HAIR_COLOR, hairColorFor } from "../../js/avatar-layers.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HTML = readFileSync(join(REPO, "avatar.html"), "utf8");

function source(name) {
  let start = HTML.indexOf("function " + name + "(");
  assert.notEqual(start, -1, name + " not found in avatar.html");
  if (HTML.slice(start - 6, start) === "async ") start -= 6;
  const open = HTML.indexOf("{", start);
  let depth = 0;
  for (let j = open; j < HTML.length; j++) {
    if (HTML[j] === "{") depth++;
    else if (HTML[j] === "}" && --depth === 0) return HTML.slice(start, j + 1);
  }
  throw new Error("unbalanced braces in " + name);
}

// The page declares HAIR_COLOR_LABELS next to the renderer; lift it the same way.
function labels() {
  const start = HTML.indexOf("const HAIR_COLOR_LABELS = {");
  assert.notEqual(start, -1, "HAIR_COLOR_LABELS not found");
  const end = HTML.indexOf("};", start) + 2;
  return new Function(HTML.slice(start, end) + " return HAIR_COLOR_LABELS;")();
}

function renderHairColor(identity) {
  const container = { innerHTML: "" };
  const doc = { getElementById: (id) => (id === "hairColorButtons" ? container : null) };
  const make = new Function(
    "document", "avatarIdentity", "HAIR_COLORS", "HAIR_COLOR_TOKENS", "HAIR_COLOR_LABELS", "hairColorFor",
    source("renderHairColor") + "; return renderHairColor;",
  );
  make(doc, identity, HAIR_COLORS, HAIR_COLOR_TOKENS, labels(), hairColorFor)();
  return container.innerHTML;
}

async function handleSetHairColor(value, { rpcError = null } = {}) {
  const calls = { rpc: [], toasts: [], sounds: [], rendered: 0 };
  const supabase = {
    rpc: (name, args) => {
      calls.rpc.push({ name, args });
      return { data: rpcError ? null : { hair_color: value }, error: rpcError };
    },
  };
  const make = new Function(
    "supabase", "showToast", "playSound", "renderAll", "console", "avatarIdentity", "HAIR_COLORS",
    source("handleSetHairColor") + "; return handleSetHairColor;",
  );
  const fn = make(
    supabase,
    (msg, kind) => calls.toasts.push({ msg, kind }),
    (s) => calls.sounds.push(s),
    () => { calls.rendered++; },
    { error: () => {} },
    { hairstyle: "buzzcut" },
    HAIR_COLORS,
  );
  await fn(value);
  return calls;
}

// ── the control exists, and matches the palette exactly ──────────────────────────────

test("every palette colour gets a button, in palette order", () => {
  const html = renderHairColor({ hair_color: "brown" });
  const rendered = [...html.matchAll(/data-hair-color="([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(rendered, [...HAIR_COLORS]);
  assert.equal((html.match(/<button/g) || []).length, HAIR_COLORS.length);
});

test("the palette is exactly what the RPC accepts", () => {
  // Pinned as data: set_avatar_identity raises on anything outside this set, so a
  // button the database would reject must never be renderable.
  assert.deepEqual([...HAIR_COLORS], [
    "black", "dark_brown", "brown", "light_brown", "blonde", "red", "auburn", "fantasy_blue",
  ]);
});

test("each button carries its own token colours, not a hardcoded copy", () => {
  const html = renderHairColor({ hair_color: "brown" });
  for (const value of HAIR_COLORS) {
    const t = HAIR_COLOR_TOKENS[value];
    assert.ok(
      html.includes(`background:${t.base};border-color:${t.shadow}`),
      `${value} does not paint its own token pair`,
    );
  }
});

// ── the active marking follows the resolver, including its defaulting ────────────────

test("the stored colour is the one marked active", () => {
  const html = renderHairColor({ hair_color: "red" });
  assert.match(html, /class="identity-btn active"[\s\S]*?data-hair-color="red"[\s\S]*?aria-pressed="true"/);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
});

test("a missing or broken value falls back to the default, still exactly one active", () => {
  for (const identity of [{}, null, { hair_color: "" }, { hair_color: "chartreuse" }]) {
    const html = renderHairColor(identity);
    assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1,
      "broken identity: " + JSON.stringify(identity));
    assert.ok(
      new RegExp(`active"[\\s\\S]*?data-hair-color="${DEFAULT_HAIR_COLOR}"`).test(html),
      "the default is not the active one for " + JSON.stringify(identity),
    );
  }
});

// ── accessibility: colour is never the only cue ──────────────────────────────────────

test("every button has a readable Danish label, and the swatch is hidden from readers", () => {
  const html = renderHairColor({ hair_color: "brown" });
  const map = labels();
  for (const value of HAIR_COLORS) {
    assert.ok(map[value], value + " has no label");
    assert.ok(html.includes(">" + map[value] + "</button>"), value + " renders no visible label");
  }
  // the colour dot is decoration: it must not be announced, and must not be the only cue
  assert.equal((html.match(/class="hair-swatch" aria-hidden="true"/g) || []).length, HAIR_COLORS.length);
});

// ── the write path ───────────────────────────────────────────────────────────────────

test("choosing a colour saves it and confirms it", async () => {
  const calls = await handleSetHairColor("blonde");
  assert.deepEqual(calls.rpc.map((c) => c.name), ["set_avatar_identity"]);
  assert.deepEqual(calls.rpc[0].args, { p_hair_color: "blonde" });
  assert.equal(calls.toasts.length, 1);
  assert.match(calls.toasts[0].msg, /Hårfarve opdateret/);
  assert.equal(calls.toasts[0].kind, "success");
  assert.equal(calls.rendered, 1, "the avatar was not repainted");
});

test("only the colour is sent, so the rest of the identity is left to the RPC merge", async () => {
  const calls = await handleSetHairColor("auburn");
  assert.deepEqual(Object.keys(calls.rpc[0].args), ["p_hair_color"]);
});

test("a value outside the palette never reaches the database", async () => {
  const calls = await handleSetHairColor("chartreuse");
  assert.deepEqual(calls.rpc, [], "an invalid colour was sent to the RPC");
  assert.equal(calls.toasts.length, 1);
  assert.equal(calls.toasts[0].kind, "error");
  assert.equal(calls.rendered, 0);
});

test("an RPC failure is reported, never shown as success", async () => {
  const calls = await handleSetHairColor("red", { rpcError: { message: "boom" } });
  assert.equal(calls.rpc.length, 1);
  assert.equal(calls.toasts.length, 1);
  assert.equal(calls.toasts[0].kind, "error");
  assert.ok(!/opdateret/.test(calls.toasts[0].msg), "a failed write claimed success");
  assert.equal(calls.rendered, 0, "a failed write still repainted");
});

// ── the colour is offered on BOTH render paths ───────────────────────────────────────

test("the picker is not gated on the render path, because both paths honour the colour", () => {
  const src = source("renderHairColor");
  assert.ok(!/hairstyleShapesSupported/.test(src),
    "the colour picker must not inherit the D-102 shape gate: C2 and R2 both apply the colour");
  const render = readFileSync(join(REPO, "js", "avatar-render-c2.js"), "utf8");
  assert.match(render, /--hair-base/, "the C2 path no longer consumes the base token");
  assert.match(render, /s\.hair,[^\n]*tint:\s*"hair"/, "the R2 path no longer tints the hair map");
});

test("the picker is wired into the identity panel and its own container exists", () => {
  assert.match(HTML, /<div class="identity-section-label">Hårfarve<\/div>/);
  assert.match(HTML, /id="hairColorButtons"/);
  assert.match(HTML, /renderHairstyle\(\);\s*renderHairColor\(\);\s*renderSkinTone\(\);/);
  const handler = HTML.slice(HTML.indexOf('getElementById("hairColorButtons").addEventListener'));
  assert.ok(handler.indexOf("handleSetHairColor(") > 0, "the container has no click handler");
});
