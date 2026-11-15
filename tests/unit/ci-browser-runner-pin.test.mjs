// Ethvert GitHub Actions-job, der installerer eller kører Playwright-browsere, kører på en runner, som
// projektets Playwright-version understøtter. 2026-11-12 blev ubuntu-latest til ubuntu-26.04, hvor
// Playwright 1.59.1 afviser chromium ("Playwright does not support chromium on ubuntu26.04-x64",
// kørsel 43167266559). #692 låste isolated-e2e, #696 de tre resterende jobs. Denne test fanger et nyt
// browserjob eller en tilbagerulning, før det rammer CI.
//
// Testen læser workflowets struktur: top-niveauets `jobs:`-blok, ét blok pr. job (2 mellemrum), og jobbets
// egen `runs-on:`. Kommentarer tæller ikke som brug af Playwright. Fjern låsen sammen med en
// Playwright-opgradering, der understøtter den nye runner — og opdatér SUPPORTED her i samme PR.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const DIR = new URL("../../.github/workflows/", import.meta.url);
const SUPPORTED = new Set(["ubuntu-24.04"]);
// En linje, der faktisk henter eller kører browsere (ikke en kommentar).
const BROWSER_USE = /\bnpx playwright (?:install|test)\b|browser-launch-check\.mjs/;

export function jobsOf(yml) {
  const lines = yml.split("\r\n").join("\n").split("\n");
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  assert.notEqual(start, -1, "workflow uden jobs:");
  const jobs = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\S/.test(l)) break; // næste top-niveau-nøgle
    const m = /^  ([A-Za-z0-9_-]+):\s*$/.exec(l);
    if (m) jobs.push({ id: m[1], body: [] });
    else if (jobs.length) jobs[jobs.length - 1].body.push(l);
  }
  return jobs.map((j) => {
    const code = j.body.filter((l) => !/^\s*#/.test(l));
    const runsOn = code.map((l) => /^    runs-on:\s*(\S+)\s*$/.exec(l)).find(Boolean)?.[1] ?? null;
    return { id: j.id, runsOn, usesBrowsers: code.some((l) => BROWSER_USE.test(l)) };
  });
}

const workflows = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f)).sort()
  .map((f) => ({ file: f, jobs: jobsOf(readFileSync(new URL(f, DIR), "utf8")) }));

test("hvert job, der installerer eller kører Playwright-browsere, kører på en understøttet runner", () => {
  const bad = [];
  for (const w of workflows) for (const j of w.jobs) {
    if (j.usesBrowsers && !SUPPORTED.has(j.runsOn)) bad.push(`${w.file} → ${j.id}: runs-on ${j.runsOn}`);
  }
  assert.deepEqual(bad, [], `browserjobs uden låst runner (ubuntu-latest er 26.04 og understøttes ikke af Playwright 1.59.1):\n${bad.join("\n")}`);
});

test("de kendte browserjobs findes stadig — en omdøbning må ikke tømme testen", () => {
  const found = workflows.flatMap((w) => w.jobs.filter((j) => j.usesBrowsers).map((j) => `${w.file}:${j.id}`)).sort();
  for (const k of ["adventure-engine.yml:e2e", "isolated-e2e.yml:isolated-e2e", "playwright.yml:test", "update-avatar-goldens.yml:update"]) {
    assert.ok(found.includes(k), `${k} genkendes ikke længere som browserjob (fundet: ${found.join(", ")})`);
  }
});

test("avatar-goldens skrives på samme runner som testene, der sammenligner dem", () => {
  const runner = (file, id) => workflows.find((w) => w.file === file).jobs.find((j) => j.id === id).runsOn;
  assert.equal(runner("update-avatar-goldens.yml", "update"), runner("playwright.yml", "test"),
    "goldens genereret på ét OS og sammenlignet på et andet giver pixelforskelle (#35/#40)");
});

test("parseren: kommentarer og andre top-niveau-blokke tæller ikke; et ulåst browserjob findes", () => {
  const y = [
    "on:", "  push:", "    branches: [main]", "jobs:",
    "  node-only:", "    runs-on: ubuntu-latest", "    steps:", "      # npx playwright install --with-deps (kun en kommentar)", "      - run: npm test",
    "  browsers:", "    runs-on: ubuntu-latest", "    steps:", "      - run: npx playwright install --with-deps chromium",
    "  pinned:", "    runs-on: ubuntu-24.04", "    steps:", "      - run: |", "          if ! timeout --kill-after=30s 10m npx playwright install --with-deps; then exit 1; fi",
  ].join("\n");
  assert.deepEqual(jobsOf(y), [
    { id: "node-only", runsOn: "ubuntu-latest", usesBrowsers: false },
    { id: "browsers", runsOn: "ubuntu-latest", usesBrowsers: true },
    { id: "pinned", runsOn: "ubuntu-24.04", usesBrowsers: true },
  ]);
});
