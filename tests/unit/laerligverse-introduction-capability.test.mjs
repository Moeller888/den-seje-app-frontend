// F12-B: the introduction capability between the Lærligverse host and get-next-question — the host-side pieces that
// can be checked without a browser or a backend: the version both ends agree on, the server's pure decisions, the
// host page's "Tilbage til Lærlig" configuration and the update notice's markup and wiring.
// The server path is proven call for call in laerligverse-introduction-gnq.test.mjs, against the real stack in
// tests/isolated/laerligverse-introduction.isolated.spec.mjs and in the real game in laerligverse-arkivskabet-real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderHostPage } from "../../tools/laerligverse/host-page.mjs";
import { INTRODUCTION_CAPABILITY } from "../../laerligverse/host/bridge/laerlig-service.js";
import { INTRODUCTION_CAPABILITY_FIELD, INTRODUCTION_CAPABILITY_VERSION, introductionCapabilityOf, introductionRequired } from "../../supabase/functions/_shared/introduction.ts";

const GAME = "http://127.0.0.1:4331";
const SUPA = "http://127.0.0.1:54321";
const base = { mode: "isolated-test", gameOrigin: GAME, gameUrl: `${GAME}/game.html`, supabaseUrl: SUPA, anonKey: "k" };
const configOf = (html) => JSON.parse(html.match(/<script type="application\/json" id="lv-config">([\s\S]*?)<\/script>/)[1]);
const HTML = readFileSync(new URL("../../laerligverse/host/index.html", import.meta.url), "utf8");
const APP = readFileSync(new URL("../../laerligverse/host/host-app.js", import.meta.url), "utf8");

test("the host sends exactly the version the server knows, under the field the server reads", () => {
  assert.equal(INTRODUCTION_CAPABILITY, INTRODUCTION_CAPABILITY_VERSION);
  assert.equal(INTRODUCTION_CAPABILITY_FIELD, "introduction_capability");
  const src = readFileSync(new URL("../../adventure-engine/packages/learning-bridge/src/laerlig-service.ts", import.meta.url), "utf8");
  assert.match(src, /introduction_capability: INTRODUCTION_CAPABILITY/);
});

test("introductionCapabilityOf: absent unless the field is there; only the integer 1 is supported; anything else is invalid", () => {
  for (const body of [{}, null, undefined, [], "x", { subject: "historie" }]) assert.equal(introductionCapabilityOf(body), "absent", JSON.stringify(body));
  assert.equal(introductionCapabilityOf({ introduction_capability: 1 }), "supported");
  for (const v of [0, 2, -1, 1.5, "1", "on", true, false, null, [], {}, [1], NaN]) {
    assert.equal(introductionCapabilityOf({ introduction_capability: v }), "invalid", String(v));
  }
  // An inherited property is not the request's own field.
  assert.equal(introductionCapabilityOf(Object.create({ introduction_capability: 1 })), "absent");
});

test("introductionRequired: the same rule as serve_introduction, decided from two reads; malformed rows are an error, never 'not required'", () => {
  const active = [{ id: "i" }];
  assert.deepEqual(introductionRequired([], active), { kind: "required" });
  assert.deepEqual(introductionRequired([], []), { kind: "not_required" });
  assert.deepEqual(introductionRequired([{ completed_at: null }], []), { kind: "required" }, "an open round of an inactive version still counts");
  assert.deepEqual(introductionRequired([{ completed_at: "2026-11-20T10:00:00Z" }], active), { kind: "not_required" });
  for (const [rounds, act] of [[null, active], [[], null], [[{}], active], [[{ completed_at: 3 }], active], [[null], active], ["x", []]]) {
    assert.equal(introductionRequired(rounds, act).kind, "error", JSON.stringify([rounds, act]));
  }
});

test("the host page carries returnUrl only as an http(s) URL on a valid origin; anything else refuses the page", () => {
  assert.equal(configOf(renderHostPage(base)).returnUrl, null, "default: no link");
  assert.equal(configOf(renderHostPage({ ...base, returnUrl: "http://127.0.0.1:8788/hub.html" })).returnUrl, "http://127.0.0.1:8788/hub.html");
  assert.equal(configOf(renderHostPage({ ...base, returnUrl: "https://xn--lrlig-qra.dk/hub.html" })).returnUrl, "https://xn--lrlig-qra.dk/hub.html");
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "/hub.html", "hub.html", "http://example.com/hub.html", "ftp://127.0.0.1/x", 5, true]) {
    assert.throws(() => renderHostPage({ ...base, returnUrl: bad }), /invalid returnUrl/, String(bad));
  }
  // The JSON stays inert even with a hostile query string.
  const html = renderHostPage({ ...base, returnUrl: "http://127.0.0.1:8788/hub.html?x=</script><script>alert(1)</script>" });
  assert.equal(html.includes("</script><script>alert(1)"), false);
});

test("the update notice: Danish text, two actions, focusable, hidden until needed; shown only on 'outdated', never a reload by itself", () => {
  // role="alert", not "alertdialog": announced without focus (the host cannot take focus from the cross-origin game frame).
  assert.match(HTML, /<section id="lv-update"[^>]*role="alert"[^>]*tabindex="-1"[^>]*hidden>/);
  assert.match(HTML, /<p id="lv-update-text">Lærligvers er blevet opdateret\. Genindlæs siden for at fortsætte, hvor du slap\.<\/p>/);
  assert.match(HTML, /<button id="lv-update-reload" type="button">Genindlæs<\/button>/);
  assert.match(HTML, /<a id="lv-update-back"[^>]*href="#" hidden>Tilbage til Lærlig<\/a>/);
  // Wiring: shown on the service error "outdated" only; reload only from the button; focus moves to the notice.
  assert.match(APP, /if \(e\.type === "service-error" && e\.code === "outdated"\) showUpdateNotice\(c\);/);
  assert.equal((APP.match(/location\.reload\(\)/g) ?? []).length, 1, "the only reload is the button's");
  assert.match(APP, /\$\("lv-update-reload"\)\.addEventListener\("click", \(\) => location\.reload\(\)\);/);
  assert.match(APP, /box\.focus\(\);/);
  // Focus is kept out of the game frame while the notice is shown (measured: inert alone did not hold in Chromium or
  // WebKit, hiding alone not in WebKit): the region is hidden before the notice takes focus, and focus landing on the
  // frame goes back to the notice. A new sign-in lifts both, before the game region is shown again.
  const show = APP.slice(APP.indexOf("function showUpdateNotice"), APP.indexOf("function hideUpdateNotice"));
  assert.ok(show.indexOf('$("lv-game-region").hidden = true;') !== -1 && show.indexOf('$("lv-game-region").hidden = true;') < show.indexOf("box.focus();"));
  assert.match(APP, /if \(!box\.hidden && document\.activeElement === \$\("lv-game"\)\) box\.focus\(\);/);
  assert.match(APP, /guardNoticeFocus\(\);/);
  assert.match(APP, /hideUpdateNotice\(\);\n\s*\$\("lv-game-region"\)\.hidden = false;/);
  assert.doesNotMatch(APP, /\.inert\b/, "inert is not the mechanism (disproven in two engines)");
  // returnUrl is validated by the page too (a hand-edited config is refused, not obeyed).
  assert.match(APP, /if \(u\.protocol !== "https:" && u\.protocol !== "http:"\) return null;/);
});
