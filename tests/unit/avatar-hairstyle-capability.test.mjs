// D-102 option D (owner decision 2026-08-20): the R2 render resolves ONE hair asset and
// ignores identity.hairstyle, so the avatar page must not offer shape controls on that
// path. These tests do NOT grep for a sentence: they lift the real functions out of
// avatar.html, run them against a stub DOM and stub RPC, and assert what they actually
// do — in both capability states. A test that only matched a string would still pass if
// the buttons were left behind next to the message.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isAvatarR2ActiveFor, R2_MANIFEST } from "../../js/avatar-layers.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HTML = readFileSync(join(REPO, "avatar.html"), "utf8");
const RENDER_C2 = readFileSync(join(REPO, "js", "avatar-render-c2.js"), "utf8");

// 155E shipped the hair-colour picker, so the sentence that said colour could not be
// chosen would itself have become false. The message now points at the control.
const MESSAGE = "Frisureformer kommer snart til den nye avatar. Farven kan du vælge nedenfor.";

// Lift a top-level function out of the page by matching braces — no eval of the whole page.
function source(name) {
  let start = HTML.indexOf("function " + name + "(");
  assert.notEqual(start, -1, name + " not found in avatar.html");
  // Keep an `async` prefix: dropping it turns the body's `await` into a syntax error.
  if (HTML.slice(start - 6, start) === "async ") start -= 6;
  const open = HTML.indexOf("{", start);
  let depth = 0;
  for (let j = open; j < HTML.length; j++) {
    if (HTML[j] === "{") depth++;
    else if (HTML[j] === "}" && --depth === 0) return HTML.slice(start, j + 1);
  }
  throw new Error("unbalanced braces in " + name);
}

// Runs the page's real renderHairstyle() with the capability forced either way.
function renderHairstyle(supported, identity) {
  const container = { innerHTML: "" };
  const doc = { getElementById: (id) => (id === "hairstyleButtons" ? container : null) };
  const make = new Function(
    "document", "avatarIdentity", "hairstyleShapesSupported",
    source("renderHairstyle") + "; return renderHairstyle;",
  );
  make(doc, identity, () => supported)();
  return container.innerHTML;
}

// Runs the page's real handleSetHairstyle() with recording stubs.
async function handleSetHairstyle(supported, hairstyle) {
  const calls = { rpc: [], toasts: [], sounds: [] };
  const supabase = {
    rpc: (name, args) => {
      calls.rpc.push({ name, args });
      return { data: { hairstyle }, error: null };
    },
  };
  const make = new Function(
    "supabase", "showToast", "playSound", "renderAll", "console",
    "avatarIdentity", "hairstyleShapesSupported",
    source("handleSetHairstyle") + "; return handleSetHairstyle;",
  );
  const fn = make(
    supabase,
    (msg, kind) => calls.toasts.push({ msg, kind }),
    (s) => calls.sounds.push(s),
    () => {},
    console,
    { hairstyle: "buzzcut" },
    () => supported,
  );
  await fn(hairstyle);
  return calls;
}

// ── 1 + 2 + 9: the R2 path states the situation and offers nothing actionable ──────────

test("R2: the hairstyle section shows the explanation and no shape controls", () => {
  const html = renderHairstyle(false, { hairstyle: "buzzcut" });
  assert.ok(html.includes(MESSAGE), "the explanation is not rendered");
  assert.ok(!/<button/i.test(html), "a button survives on a path that ignores the choice");
  assert.ok(!/data-hairstyle=/.test(html), "a hairstyle control survives");
  assert.ok(!/identity-btn/.test(html), "a control-styled element survives");
});

test("R2: nothing in the section is focusable or announced as actionable", () => {
  const html = renderHairstyle(false, { hairstyle: "short" });
  const traps = [/<a[\s>]/i, /<input/i, /<select/i, /tabindex/i, /role\s*=/i,
                 /onclick/i, /contenteditable/i, /aria-pressed/i];
  for (const trap of traps) {
    assert.ok(!trap.test(html), "keyboard/screen-reader trap present: " + trap);
  }
  // It is a paragraph of text, not a disabled control dressed up as one.
  assert.match(html, /^<p class="identity-note" data-hairstyle-unavailable>/);
});

// ── 3 + 4: the R2 path cannot write a choice and cannot claim success ──────────────────

test("R2: choosing a shape writes nothing and shows no success toast", async () => {
  const calls = await handleSetHairstyle(false, "curly");
  assert.deepEqual(calls.rpc, [], "an RPC was sent from a path that ignores the choice");
  assert.deepEqual(calls.toasts, [], "a toast was shown for a change that did not happen");
});

test("the click handler refuses to act on a stale control", () => {
  const handler = HTML.slice(HTML.indexOf('getElementById("hairstyleButtons").addEventListener'));
  const guard = handler.indexOf("hairstyleShapesSupported()");
  const call = handler.indexOf("handleSetHairstyle(");
  assert.ok(guard !== -1, "the click handler has no capability guard");
  assert.ok(guard < call, "the guard must run before the write is attempted");
});

// ── 5: an existing stored value is preserved ──────────────────────────────────────────

test("a stored hairstyle survives the R2 path untouched", async () => {
  const identity = { hairstyle: "buzzcut" };
  renderHairstyle(false, identity);
  assert.equal(identity.hairstyle, "buzzcut", "rendering mutated the stored identity");
  const calls = await handleSetHairstyle(false, "curly");
  assert.deepEqual(calls.rpc, [], "a write would have overwritten the stored value");
  // and nothing in the page clears or migrates it
  assert.ok(!/p_hairstyle:\s*null/.test(HTML), "the page nulls a stored hairstyle somewhere");
});

// ── 6: hair colour is untouched and still applies on R2 ───────────────────────────────

test("hair colour still reaches the R2 render", () => {
  assert.match(RENDER_C2, /s\.hair,[^\n]*tint:\s*"hair"/,
    "the R2 stack no longer tints hair from the identity token");
  assert.match(RENDER_C2, /hairColorTokensFor\(identity\)/, "the hair colour token lookup is gone");
});

// ── 7: a path that honours the choice keeps the full control ─────────────────────────

test("C2: the seven shape controls and the active marking are unchanged", () => {
  const html = renderHairstyle(true, { hairstyle: "curly" });
  const values = [...html.matchAll(/data-hairstyle="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(values, ["default", "braid", "short", "curly", "long", "sidecut", "buzzcut"]);
  assert.equal((html.match(/<button/g) || []).length, 7);
  assert.match(html, /class="identity-btn active"[\s\S]*?data-hairstyle="curly"[\s\S]*?aria-pressed="true"/);
  assert.ok(!html.includes(MESSAGE), "the unavailable note leaked onto a supported path");
});

test("C2: choosing a shape still saves it and confirms it", async () => {
  const calls = await handleSetHairstyle(true, "curly");
  assert.deepEqual(calls.rpc.map((c) => c.name), ["set_avatar_identity"]);
  assert.deepEqual(calls.rpc[0].args, { p_hairstyle: "curly" });
  assert.equal(calls.toasts.length, 1);
  assert.match(calls.toasts[0].msg, /Frisure opdateret/);
});

// ── 8: the decision comes from the render path, and from nothing else ────────────────

test("the capability is decided by the render path, not by population or browser", () => {
  const src = source("hairstyleShapesSupported");
  assert.match(src, /activeRenderPath/, "it does not consult the mounted render path");
  assert.match(src, /isAvatarR2ActiveFor/, "it does not fall back to the render predicate");
  // Inspect the CODE, not the prose: comments may legitimately discuss what was ruled out.
  const code = src.replace(/\/\/.*$/gm, "");
  const forbidden = [/student/i, /count/i, /navigator/i, /userAgent/i,
                     /localStorage/i, /\bDate\b/, /20\d\d/];
  for (const f of forbidden) {
    assert.ok(!f.test(code), "the capability consults something it must not: " + f);
  }
});

test("the underlying predicate tracks the manifest, so option A re-enables the UI by itself", () => {
  // Today the R2 stack resolves for a neutral/medium identity → R2 is active → no shapes.
  assert.equal(isAvatarR2ActiveFor({ body_type: "neutral", skin_tone: "medium" }), true);
  // An identity the R2 stack cannot serve falls to C2, where the shapes are honoured.
  assert.equal(isAvatarR2ActiveFor({ body_type: "male", skin_tone: "medium" }), false);
  // The gap this decision documents: one registered hair asset for seven selectable styles.
  assert.deepEqual(Object.keys(R2_MANIFEST.hair), ["northstar"]);
});

// ── the note has to be readable, or D-102 replaced buttons with something invisible ──

test("the note the student must read clears the contrast minimum", () => {
  // Not a name check: resolve the tokens from theme.css, model the cascade, and compute the
  // ratio. --text-faint is the empty/disabled token and lands at 1.58:1 on the panel, which
  // is below the 4.5:1 minimum - and a message nobody can read is not an honest UI.
  const rules = [...HTML.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => /\.identity-note\b/.test(m[1]) && /(^|[\s;])color\s*:/.test(m[2]));
  assert.ok(rules.length, "no rule sets a colour on the note");

  // last one wins at equal specificity, so that is the colour the student actually sees
  const token = /color\s*:\s*var\((--[a-z-]+)\)/.exec(rules[rules.length - 1][2]);
  assert.ok(token, "the note's colour is not taken from a theme token");
  assert.notEqual(token[1], "--text-faint", "the note is back on the empty-state token");

  const theme = readFileSync(join(REPO, "css", "theme.css"), "utf8");
  const hex = (name) => {
    const m = new RegExp(name + "\\s*:\\s*(#[0-9a-fA-F]{6})").exec(theme);
    assert.ok(m, name + " not found in theme.css");
    return m[1];
  };
  const lum = (h) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const fg = lum(hex(token[1])), bg = lum(hex("--bg-panel"));
  const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  assert.ok(ratio >= 4.5, `note contrast ${ratio.toFixed(2)}:1 is below the 4.5:1 minimum`);

  // and the shared typography rule keeps --text-faint for the real empty state
  assert.match(HTML, /\.titles-empty,\s*\r?\n\s*\.identity-note \{\s*\r?\n\s*color: var\(--text-faint\);/);
});