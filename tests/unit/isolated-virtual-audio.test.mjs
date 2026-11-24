// D-362 / PR #736 — the isolated suite's VIRTUAL AUDIO OUTPUT (tests/isolated/ci/virtual-audio.sh and its three
// steps in .github/workflows/isolated-e2e.yml). Firefox on the Linux runner had no sound server, so every <audio>
// failed with NS_ERROR_DOM_MEDIA_MEDIASINK_ERR. These checks pin that the fix stays narrow: production lane only,
// before the network lock, its OWN package cache (never the browser/apt entry playwright.yml shares), no secret,
// and a loud INFRA-AUDIO failure instead of a silent run without sound.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOW = readFileSync(join(ROOT, ".github", "workflows", "isolated-e2e.yml"), "utf8");
const PLAYWRIGHT_WORKFLOW = readFileSync(join(ROOT, ".github", "workflows", "playwright.yml"), "utf8");
const SCRIPT = readFileSync(join(ROOT, "tests", "isolated", "ci", "virtual-audio.sh"), "utf8");

/** The job's steps as text blocks, in order (each starts at a "      - " line). */
function steps(yaml) {
  const lines = yaml.split("\n");
  const out = [];
  let current = null;
  for (const line of lines) {
    if (/^      - /.test(line)) {
      if (current) out.push(current);
      current = line + "\n";
    } else if (current !== null) {
      if (/^  [a-z]/.test(line)) { out.push(current); current = null; continue; }
      current += line + "\n";
    }
  }
  if (current) out.push(current);
  return out;
}
const STEPS = steps(WORKFLOW);
const indexOf = (needle) => STEPS.findIndex((s) => s.includes(needle));
const AUDIO = STEPS.filter((s) => /name: Audio — /.test(s));

test("two audio steps exist, both in the production lane only", () => {
  assert.equal(AUDIO.length, 2, "the package cache, then install + start");
  for (const step of AUDIO) {
    assert.match(step, /if: needs\.plan\.outputs\.scope != 'docs-md' && matrix\.profile == 'production'/, step.split("\n")[0]);
  }
});

test("they run after the shared browser cache is saved and before the network lock and the suite", () => {
  const save = indexOf("name: Save Playwright browser and apt cache");
  const lock = indexOf("name: Network lock");
  const suite = indexOf("name: Existing Playwright suite against the isolated stack");
  assert.ok(save >= 0 && lock > save && suite > lock);
  for (const step of AUDIO) {
    const at = STEPS.indexOf(step);
    assert.ok(at > save && at < lock, `${step.split("\n")[0].trim()} sits between the browser cache and the lock`);
  }
});

test("the audio packages have their OWN cache; the shared browser/apt key is unchanged", () => {
  for (const step of AUDIO.filter((s) => s.includes("actions/cache"))) {
    assert.match(step, /path: ~\/\.cache\/pw-audio-apt\n/);
    assert.match(step, /key: pw-audio-apt-\$\{\{ steps\.pwver\.outputs\.image \}\}-pulseaudio/);
    assert.doesNotMatch(step, /~\/\.cache\/pw-apt\b|ms-playwright|steps\.pwver\.outputs\.key/);
  }
  assert.ok(WORKFLOW.includes('echo "key=pw-browsers-apt-${ImageOS:-unknown}-${ImageVersion:-unknown}-playwright-${v}" >> "$GITHUB_OUTPUT"'));
  assert.ok(WORKFLOW.includes('echo "image=${ImageOS:-unknown}-${ImageVersion:-unknown}" >> "$GITHUB_OUTPUT"'));
  assert.match(SCRIPT, /cache="\$\{HOME\}\/\.cache\/pw-audio-apt"/);
  const code = SCRIPT.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n"); // comments may name it
  assert.doesNotMatch(code, /\.cache\/pw-apt\b/, "the script never touches the shared browser/apt cache");
});

test("the audio cache is ONE restore-and-save step, conditioned on the lane only (D-261: no new event condition)", () => {
  const cache = AUDIO.filter((s) => s.includes("actions/cache"));
  assert.equal(cache.length, 1);
  assert.match(cache[0], /uses: actions\/cache@v4\n/);
  for (const step of AUDIO) assert.doesNotMatch(step, /event_name|github\.ref|ref_name/);
});

test("no secret, no variable and no production name in the audio steps or the script", () => {
  for (const text of [...AUDIO, SCRIPT]) {
    assert.doesNotMatch(text, /secrets\.|vars\.|supabase\.co|lærlig|xn--lrlig/i);
  }
});

test("the script installs from its cache first, bounds the mirror path, and fails loud", () => {
  assert.match(SCRIPT, /^set -euo pipefail$/m);
  assert.match(SCRIPT, /apt-get install -y --no-download --no-remove --no-install-recommends "\$cache"\/\*\.deb/);
  assert.match(SCRIPT, /timeout --kill-after=30s 4m sudo apt-get install -y --no-remove --no-install-recommends/);
  assert.match(SCRIPT, /-o Dir::Cache::archives="\$archives" pulseaudio/, "only pulseaudio's own closure is kept for the cache");
  assert.match(SCRIPT, /fail\(\) \{ echo "::error title=INFRA-AUDIO::/);
  // Started AND verified: a server answers and a sink exists — or the job stops before any test.
  assert.match(SCRIPT, /pulseaudio --daemonize=yes --exit-idle-time=-1/);
  assert.match(SCRIPT, /pactl info/);
  assert.match(SCRIPT, /pactl list short sinks/);
  assert.match(SCRIPT, /\|\| fail "PulseAudio runs but has no sink"/);
});

test("the script is valid bash, executable in git, and refuses an unknown mode", () => {
  const mode = execFileSync("git", ["-C", ROOT, "ls-files", "-s", "tests/isolated/ci/virtual-audio.sh"], { encoding: "utf8" });
  assert.match(mode, /^100755 /, "executable bit set in git");
  let bash = "bash";
  try { execFileSync(bash, ["-n", join(ROOT, "tests", "isolated", "ci", "virtual-audio.sh")]); } catch (e) {
    if (e.code === "ENOENT") return; // no bash on this machine: the syntax is checked where bash exists (CI)
    throw e;
  }
  let code = 0;
  try { execFileSync(bash, [join(ROOT, "tests", "isolated", "ci", "virtual-audio.sh"), "nonsense"], { stdio: "pipe" }); }
  catch (e) { code = e.status; }
  assert.equal(code, 2);
});

test("playwright.yml (production-facing suite) is untouched by the virtual audio output", () => {
  assert.doesNotMatch(PLAYWRIGHT_WORKFLOW, /virtual-audio|pulseaudio|pw-audio-apt/);
});
