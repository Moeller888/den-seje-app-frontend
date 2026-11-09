// D-366: a wardrobe choice on Avatar changes the outfit in place. The wiring is pinned here; the behaviour in the browser (no reload,
// kept category, scroll and focus, the bottom swap, quick choices, a failed save) is tests/wardrobe-in-place.spec.ts, and the account
// persistence in the suite's environment is tests/wardrobe-in-place-account.spec.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const L = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href);

test("the account choice can be read back as a copy, {} when there is none", () => {
  L.northstarUseAccount(null);
  assert.deepEqual(L.northstarAccountChoice(), {});
  L.northstarUseAccount({ northstar: { outfit: "K01", top: "TK-NAVY" } });
  const c = L.northstarAccountChoice();
  assert.deepEqual(c, { outfit: "K01", top: "TK-NAVY" });
  c.top = "changed";
  assert.deepEqual(L.northstarAccountChoice(), { outfit: "K01", top: "TK-NAVY" }, "a copy, not the stored object");
  L.northstarUseAccount({ northstar: ["not", "an", "object"] });
  assert.deepEqual(L.northstarAccountChoice(), {});
});

test("with onChoice the wardrobe never reloads: it shows the choice, saves one at a time and falls back to the last saved", () => {
  const src = read("js/avatar-northstar-panel.js");
  const w = src.slice(src.indexOf("export function mountNorthstarWardrobe"));
  const inPlace = w.slice(w.indexOf("if (inPlace) {"), w.indexOf("const buttons ="));
  assert.ok(inPlace.length > 0 && !inPlace.includes("location.reload"), "the in-place path has no reload");
  assert.match(w, /northstarUseAccount\(\{ northstar: choice \}\)/, "the renderer reads the shown choice from the account choice");
  assert.match(w, /if \(sending \|\| !pending\) return;/, "one save at a time");
  assert.match(w, /if \(pending\) \{ send\(\); return; \}/, "a newer choice made meanwhile is the one that is sent");
  assert.match(w, /show\(saved\)/, "a failed newest save shows the last saved outfit");
  assert.match(w, /Valget kunne ikke gemmes\. Prøv igen\./);
  assert.match(w, /focus\(\{ preventScroll: true \}\)/, "focus stays without scrolling");
  assert.match(w, /location\.reload\(\)/, "without onChoice the page reloads as before (D-359)");
});

test("the page wires onChoice to its own renderer and identity, and still saves through set_avatar_northstar", () => {
  const H = read("avatar.html");
  const m = H.slice(H.indexOf("ns.mountNorthstarWardrobe("), H.indexOf("applyItemCategory();", H.indexOf("ns.mountNorthstarWardrobe(")));
  assert.match(m, /supabase\.rpc\("set_avatar_northstar", \{ p_choice: choice \}\)/);
  assert.match(m, /onChoice: \(choice\) => \{/);
  assert.match(m, /renderAvatar\(false, \{ keepFigure: true \}\);/, "the existing renderer draws the preview, without a fade and keeping the current figure until the new one is mounted");
  assert.match(H, /querySelectorAll\(keepFigure \? "img\.avatar-layer:not\(\[data-c2-layer\]\)" : "img\.avatar-layer, \[data-c2-layer\]"\)/, "every other render removes the prior layers first, as before");
  assert.ok(!m.includes("location.reload"), "no reload on the page side");
});
