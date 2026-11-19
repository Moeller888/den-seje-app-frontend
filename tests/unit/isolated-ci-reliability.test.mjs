// CI stability after F11-B (2026-11-19): the isolated E2E's Playwright/apt cache across runner images and the
// registry fallback for Supabase's images. Runs the REAL scripts and the REAL cache classification from the
// workflow (bash), with stand-in dpkg tools and recorded log lines — no network, no Docker, no apt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, readdirSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8").split("\r\n").join("\n");
const path = (p) => new URL(p, root).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const wf = read(".github/workflows/isolated-e2e.yml");
const step = (name) => {
  const at = wf.indexOf(`- name: ${name}\n`);
  assert.notEqual(at, -1, name);
  return wf.slice(at, wf.indexOf("\n      - ", at + 10));
};
const bash = (script, env = {}) => spawnSync("bash", ["-c", script], { env: { ...process.env, ...env }, encoding: "utf8" });

// ── Registry fallback (tests/isolated/ci/registry-fallback.sh) ──────────────────────────────────────────────────
const FALLBACK = path("tests/isolated/ci/registry-fallback.sh");
function withLogs(logs, body, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), "iso-reg-"));
  try {
    logs.forEach((text, i) => writeFileSync(join(dir, `a${i}.log`), text));
    const r = bash(`source "${FALLBACK}"\n${body.replaceAll("$DIR", dir.replaceAll("\\", "/"))}`, env);
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim().split("\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a rate limit or a failed pull moves the NEXT attempt to the next registry: docker.io → public.ecr.aws → ghcr.io", () => {
  const out = withLogs(
    [
      "Error response from daemon: toomanyrequests: You have reached your unauthenticated pull rate limit.",
      "failed to pull docker image: Get \"https://public.ecr.aws/v2/\": net/http: TLS handshake timeout",
      "supabase/edge-runtime:v1.73.13 failed to pull docker image: Error response from daemon: toomanyrequests",
    ],
    `iso_use_registry; echo "$SUPABASE_INTERNAL_IMAGE_REGISTRY"
     for i in 0 1 2; do iso_after_failure "$DIR/a$i.log"; echo "$ISO_FAILURE_CLASS"; iso_use_registry; echo "$SUPABASE_INTERNAL_IMAGE_REGISTRY"; done`,
  );
  assert.deepEqual(out, ["docker.io", "rate-limit", "public.ecr.aws", "pull", "ghcr.io", "rate-limit", "docker.io"]);
});

test("a runtime that dies booting, or a missing log, keeps the registry: switching would only re-download the same image", () => {
  const out = withLogs(
    ["Bus error (core dumped)\nedge-runtime exited with code 135", "Error: port 54321 is already allocated"],
    `iso_after_failure "$DIR/a0.log"; echo "$ISO_FAILURE_CLASS"; iso_after_failure "$DIR/a1.log"; echo "$ISO_FAILURE_CLASS"
     iso_after_failure "$DIR/missing.log"; echo "$ISO_FAILURE_CLASS"
     iso_use_registry; echo "$SUPABASE_INTERNAL_IMAGE_REGISTRY"`,
  );
  assert.deepEqual(out, ["other", "other", "other", "docker.io"]);
});

test("a later step starts from the registry the stack came from; an unknown value starts from the first", () => {
  assert.deepEqual(withLogs([], `iso_use_registry; echo "$SUPABASE_INTERNAL_IMAGE_REGISTRY"`, { SUPABASE_INTERNAL_IMAGE_REGISTRY: "ghcr.io" }), ["ghcr.io"]);
  assert.deepEqual(withLogs([], `iso_use_registry; echo "$SUPABASE_INTERNAL_IMAGE_REGISTRY"`, { SUPABASE_INTERNAL_IMAGE_REGISTRY: "evil.example" }), ["docker.io"]);
});

test("the fallback holds no loop, no credential and no other registry: the workflow's bounded loops are the only retries", () => {
  const s = read("tests/isolated/ci/registry-fallback.sh");
  const code = s.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
  assert.match(code, /^ISO_REGISTRIES=\(docker\.io public\.ecr\.aws ghcr\.io\)$/m);
  assert.ok(!/\bwhile\b|\buntil\b|sleep|for attempt/.test(code), "no retry of its own");
  assert.ok(!/docker login|password|token|secret|DOCKER_|GITHUB_TOKEN/i.test(code), "anonymous pulls only");
  for (const image of ["supabase/postgres:17.6.1.063", "kong:2.8.1", "mailpit:v1.22.3", "postgrest:v14.1", "gotrue:v2.188.1",
    "realtime:v2.86.3", "storage-api:v1.54.0", "edge-runtime:v1.73.13"]) assert.ok(s.includes(image), `digest check documented for ${image}`);
});

test("workflow: both start loops pick the registry per attempt, classify the failure, stay bounded and fail hard", () => {
  const start = step("Start a bare local Supabase (no migrations, no Edge Runtime yet)");
  assert.ok(start.includes("source tests/isolated/ci/registry-fallback.sh"));
  assert.match(start, /\n\s+iso_after_failure "\$RUNNER_TEMP\/start-attempt\.log"\n\s+echo "::warning title=INFRA-IMAGE::[^\n]*\$ISO_FAILURE_CLASS/);
  assert.ok(!/\$\(iso_after_failure/.test(wf), "never in a subshell: the registry move would be lost");
  assert.ok(start.includes('[ "$attempt" = 4 ] && { echo "local stack did not start after 4 attempts" >&2; exit 1; }'));
  assert.ok(start.includes('echo "SUPABASE_INTERNAL_IMAGE_REGISTRY=$SUPABASE_INTERNAL_IMAGE_REGISTRY" >> "$GITHUB_ENV"'), "later steps use the stack's registry");
  const edge = step("Edge Functions — serve this commit's functions locally, warm every module");
  assert.ok(edge.includes("source tests/isolated/ci/registry-fallback.sh"));
  assert.match(edge, /tail -n "\+\$log_from" "\$RUNNER_TEMP\/functions\.log" > "\$RUNNER_TEMP\/edge-attempt\.log"\n\s+iso_after_failure "\$RUNNER_TEMP\/edge-attempt\.log"\n/,
    "only THIS attempt's log lines are classified");
  assert.ok(edge.includes('[ "$ready" = yes ] || { echo "Edge Runtime did not serve after 3 start attempts" >&2; exit 1; }'));
  assert.ok(edge.indexOf("iso_audit_images") > edge.indexOf("did not serve after 3 start attempts"), "the digests are logged once the runtime serves");
  assert.ok(!/docker login|secrets\./.test(wf), "no registry credential, no secret");
});

test("workflow: the curl container is pinned by digest, and a failed pull is labelled infrastructure and stops before any test", () => {
  const install = step("Install Playwright browsers");
  assert.match(install, /curl_digest=sha256:[0-9a-f]{64}\n/);
  assert.match(install, /if ! docker pull "curlimages\/curl@\$\{curl_digest\}"[^\n]*; then\n[^\n]*\n\s+echo "::error title=INFRA-IMAGE::[^\n]*no test ran"\n\s+exit 1/);
  assert.ok(install.includes('docker tag "curlimages/curl@${curl_digest}" curlimages/curl:8.11.1'));
  assert.ok(!/docker pull curlimages\/curl:8\.11\.1/.test(wf), "never by tag alone");
  assert.ok(read("tests/isolated/egress-firewall.sh").includes("curlimages/curl:8.11.1"), "the name the negative controls run");
});

// ── Playwright/apt cache across runner images ───────────────────────────────────────────────────────────────────
function classify(env) {
  const install = step("Install Playwright browsers");
  const block = install.slice(install.indexOf("cache=none"), install.indexOf('echo "::notice title=INFRA-CACHE::'));
  const r = bash(`set -euo pipefail\n${block.split("\n").map((l) => l.trim()).join("\n")}\necho "$cache"`, env);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

test("cache classification: exact hit → cache-first; same OS and OUR Playwright → seed only; another Playwright → discarded; nothing → none", () => {
  const PW_VERSION = "1.59.1";
  assert.equal(classify({ CACHE_HIT: "true", CACHE_MATCHED: "pw-browsers-apt-ubuntu24-20261116.133.1-playwright-1.59.1", PW_VERSION }), "exact");
  assert.equal(classify({ CACHE_HIT: "false", CACHE_MATCHED: "pw-browsers-apt-ubuntu24-20261111.127.1-playwright-1.59.1", PW_VERSION }), "seed");
  assert.equal(classify({ CACHE_HIT: "false", CACHE_MATCHED: "pw-browsers-apt-ubuntu24-20261111.127.1-playwright-1.58.2", PW_VERSION }), "other");
  assert.equal(classify({ CACHE_HIT: "false", CACHE_MATCHED: "pw-browsers-apt-ubuntu24-20261111.127.1-playwright-1.59.10", PW_VERSION }), "other", "a version prefix is not our version");
  assert.equal(classify({ CACHE_HIT: "", CACHE_MATCHED: "", PW_VERSION }), "none");
});

test("workflow: a miss restores only the SAME OS; the offline install needs the exact key; another Playwright version is discarded", () => {
  const ver = step("Playwright and runner image versions");
  assert.ok(ver.includes('echo "key=pw-browsers-apt-${ImageOS:-unknown}-${ImageVersion:-unknown}-playwright-${v}" >> "$GITHUB_OUTPUT"'), "exact key unchanged (shared with playwright.yml)");
  assert.ok(ver.includes('echo "prefix=pw-browsers-apt-${ImageOS:-unknown}-" >> "$GITHUB_OUTPUT"'), "fallback never crosses the OS");
  const restore = step("Restore Playwright browser and apt cache");
  assert.match(restore, /key: \$\{\{ steps\.pwver\.outputs\.key \}\}\n\s+restore-keys: \$\{\{ steps\.pwver\.outputs\.prefix \}\}/);
  const install = step("Install Playwright browsers");
  const notExact = install.indexOf('if [ "$cache" != exact ]; then');
  const offline = install.indexOf("elif sudo apt-get install -y --no-download --no-remove --no-install-recommends ~/.cache/pw-apt/*.deb");
  assert.ok(notExact !== -1 && offline > notExact, "the offline set install is reachable only with the exact entry");
  assert.ok(install.includes('if [ "$cache" = other ]; then rm -rf ~/.cache/pw-apt ~/.cache/ms-playwright; fi'));
  assert.ok(install.includes("::notice title=INFRA-CACHE-SEED::"));
  assert.ok(install.includes("rm -f ~/.cache/pw-apt/*.deb\n            bash tests/isolated/ci/keep-installed-debs.sh /var/cache/apt/archives ~/.cache/pw-apt"));
  assert.ok(!install.includes("-exec cp {} ~/.cache/pw-apt/"), "never the whole archive directory (seeded files apt did not use)");
  const save = step("Save Playwright browser and apt cache");
  assert.ok(save.includes("if: needs.plan.outputs.scope != 'docs-md' && steps.pwcache.outputs.cache-hit != 'true' && github.event_name == 'push' && github.ref == 'refs/heads/main'"),
    "only a push to main writes, and only when the exact key was missing");
});

// ── keep-installed-debs.sh with stand-in dpkg tools ────────────────────────────────────────────────────────────
function keep(files, installed) {
  const dir = mkdtempSync(join(tmpdir(), "iso-debs-"));
  try {
    const bin = join(dir, "bin"), src = join(dir, "archives"), dest = join(dir, "cache");
    mkdirSync(bin); mkdirSync(src);
    for (const f of files) writeFileSync(join(src, f), "");
    // dpkg-deb -f FILE FIELD: the stand-in reads package, version and architecture from apt's file name.
    writeFileSync(join(bin, "dpkg-deb"), `#!/usr/bin/env bash
b=$(basename "$2" .deb); IFS=_ read -r p v a <<< "$b"; v=\${v//%3a/:}
case "$3" in Package) echo "$p";; Version) echo "$v";; Architecture) echo "$a";; esac
`);
    writeFileSync(join(bin, "dpkg-query"), `#!/usr/bin/env bash
for kv in $INSTALLED; do if [ "\${kv%%=*}" = "$3" ]; then echo -n "\${kv#*=}"; exit 0; fi; done; exit 1
`);
    chmodSync(join(bin, "dpkg-deb"), 0o755); chmodSync(join(bin, "dpkg-query"), 0o755);
    const r = spawnSync("bash", [path("tests/isolated/ci/keep-installed-debs.sh"), src, dest],
      { env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, INSTALLED: installed }, encoding: "utf8" });
    return { status: r.status, out: r.stdout + r.stderr, kept: r.status === 0 ? readdirSync(dest).sort() : null };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("refill: only .debs installed in exactly that version are kept; seeded older versions and unused packages are dropped", () => {
  const r = keep(
    ["libfoo1_1.2-3_amd64.deb", "libfoo1_1.1-0_amd64.deb", "fonts-x_20240101-1_all.deb", "libbar_2%3a4.0-1_amd64.deb", "unused_1.0_amd64.deb"],
    "libfoo1:amd64=1.2-3 fonts-x=20240101-1 libbar:amd64=2:4.0-1",
  );
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(r.kept, ["fonts-x_20240101-1_all.deb", "libbar_2%3a4.0-1_amd64.deb", "libfoo1_1.2-3_amd64.deb"]);
  assert.match(r.out, /kept 3, dropped 2/);
});

test("refill fails loudly without an archive directory, and an empty one keeps nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "iso-debs-none-"));
  try {
    const r = spawnSync("bash", [path("tests/isolated/ci/keep-installed-debs.sh"), join(dir, "nope"), join(dir, "out")], { encoding: "utf8" });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /no directory/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual(keep([], "").kept, []);
});
