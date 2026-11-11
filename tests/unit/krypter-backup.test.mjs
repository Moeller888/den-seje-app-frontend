// tools/backup/krypter-backup.sh — valget af den seneste VERIFICEREDE dump og krypteringen, kørt på FALSKE
// backupmapper i en midlertidig mappe. Ingen produktionsdata, ingen rigtig backup og ingen rigtig adgangskode:
// gpg får en testadgangskode via KRYPTER_TEST_GPG_OPTS og et eget, midlertidigt GNUPGHOME.
// Springes over, hvis bash, gpg, tar, sha256sum eller find mangler (CI's ubuntu-runner har dem alle);
// den statiske test kører altid.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, rmSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "tools", "backup", "krypter-backup.sh");
const WIN = process.platform === "win32";
const BASH = WIN ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const GPG = WIN ? "/c/Program Files/Git/usr/bin/gpg.exe" : "gpg";
const has = (cmd) => spawnSync(BASH, ["-c", `command -v "${cmd}" >/dev/null`]).status === 0;
const SKIP = spawnSync(BASH, ["-c", "true"]).status !== 0 ? "bash mangler"
  : !["tar", "sha256sum", "find", "date"].every(has) ? "tar/sha256sum/find/date mangler"
  : spawnSync(BASH, ["-c", `"${GPG}" --version >/dev/null`]).status !== 0 ? "gpg mangler" : false;

const sha = (s) => createHash("sha256").update(s).digest("hex");
const posix = (p) => (WIN ? p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`) : p);
// Den rigtige rapports konklusionslinje (VERIFIKATION-dump-20261106T100041Z.md), gengivet ordret.
const REAL_CONCLUSION = "**Konklusion: BACKUP VERIFICERET** til formålet databasegendannelse, med manglerne i afsnit 5.";

// En falsk dump-mappe, som run-backup.ps1 laver den: fire .sql-filer i SHA256SUMS, deres .stderr.txt og
// RUN-INFO.txt. opts.kind: "ok" | "fejlmarkeret" | "uverificeret" | "forkert-sum" | "to-taellinger".
// opts.conclusion: rapportens konklusionsdel; opts.extra: { relativ sti: indhold } lægges i dump-mappen.
function makeDump(dir, name, opts = {}) {
  const { kind = "ok", conclusion = REAL_CONCLUSION, extra = {}, report } = opts;
  const d = join(dir, name);
  mkdirSync(d);
  const files = { "roles.sql": `-- roller ${name}\n`, "schema.sql": `-- skema ${name}\n`, "data.sql": `-- data ${name} æøå\n`, "migration-ledger.sql": "-- ledger\n" };
  for (const [f, c] of Object.entries(files)) {
    writeFileSync(join(d, f), c);
    writeFileSync(join(d, `${f}.stderr.txt`), "");
  }
  writeFileSync(join(d, "RUN-INFO.txt"), `kørt ${name}\n`);
  const sums = Object.entries(files).map(([f, c]) => `${kind === "forkert-sum" && f === "data.sql" ? sha("andet") : sha(c)} *${f}`).join("\r\n") + "\r\n";
  writeFileSync(join(d, "SHA256SUMS"), sums);
  if (kind === "fejlmarkeret") writeFileSync(join(d, "FEJLET.txt"), "fejlet\n");
  for (const [rel, c] of Object.entries(extra)) {
    if (c === null) mkdirSync(join(d, rel), { recursive: true }); else writeFileSync(join(d, rel), c);
  }
  const stamp = name.slice(5, 18);
  const counts = `expected-counts-${stamp.slice(0, 9)}${stamp.slice(9, 13)}Z.json`;
  writeFileSync(join(dir, counts), "{}\n");
  if (kind !== "uverificeret") {
    const second = kind === "to-taellinger" ? " og `expected-counts-20200101T0000Z.json`" : "";
    writeFileSync(join(dir, `VERIFIKATION-${name}.md`), report ?? [
      `# Verifikation af backup ${name}`, "", "**Fortroligt.** Må ikke lægges i Git.", "", conclusion,
      "H5/K1's backupkrav er opfyldt. Det giver ikke GO til K1.", "",
      `\`verify-backup.mjs\` med \`${counts}\`${second}: OK.`, "",
      "## 5. Mangler", "1. **Storage-filer er ikke med.**", "2. Gendannelse til et rigtigt Supabase-projekt er ikke prøvet.", ""].join("\n"));
  }
  writeFileSync(join(dir, `${name}-tillaeg.sql`), "-- tillæg\n");
  return { dir: d, counts, files };
}

function kit() {
  const dir = mkdtempSync(join(tmpdir(), "krypter-kit-"));
  writeFileSync(join(dir, "README.md"), "# kit\n");
  writeFileSync(join(dir, "verify-backup.mjs"), "// verify\n");
  const target = mkdtempSync(join(tmpdir(), "krypter-maal-"));
  const gnupg = mkdtempSync(join(tmpdir(), "krypter-gnupg-"));
  return { dir, target, gnupg };
}
function run(k, args, env = {}) {
  const r = spawnSync(BASH, [posix(SCRIPT), ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      KRYPTER_BACKUP_DIR: posix(k.dir),
      GPG_BIN: GPG,
      GNUPGHOME: posix(k.gnupg),
      KRYPTER_TEST_GPG_OPTS: "--batch --yes --pinentry-mode loopback --passphrase kun-en-test",
      KRYPTER_TEST_TILLAD_C: "1",
      ...env,
    },
  });
  return { status: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}
const cleanup = (k) => { for (const d of [k.dir, k.target, k.gnupg]) rmSync(d, { recursive: true, force: true }); };
// Hele trætilstanden (stier, størrelser, indholdets hash) — til "intet er skrevet eller ændret".
function snapshot(root) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) { out.push(`D ${relative(root, p)}`); walk(p); }
      else out.push(`F ${relative(root, p)} ${sha(readFileSync(p))} ${statSync(p).mtimeMs}`);
    }
  };
  walk(root);
  return out.join("\n");
}
function decryptListing(k, file) {
  const r = spawnSync(BASH, ["-c", `"${GPG}" --batch --pinentry-mode loopback --passphrase kun-en-test --quiet -d "${posix(file)}" | tar -tf -`],
    { encoding: "utf8", env: { ...process.env, GNUPGHOME: posix(k.gnupg) } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split(/\r?\n/).filter(Boolean).sort();
}

// ── Fase 2: rapportens konklusion ─────────────────────────────────────────

test("konklusionen: kun en entydig positiv konklusion godkendes (ægte format, CRLF, mellemrum); negative, tvetydige, manglende og modstridende afvises", { skip: SKIP }, () => {
  const k = kit();
  const lines = (...l) => l.join("\n");
  const cases = [
    // [beskrivelse, rapportens konklusionsdel eller hele rapporten via {report}, forventet godkendt]
    ["den rigtige rapports linje", REAL_CONCLUSION, true],
    ["uden fed skrift", "Konklusion: BACKUP VERIFICERET", true],
    ["små bogstaver i nøgleordet", "konklusion: backup verificeret til formålet databasegendannelse.", true],
    ["som overskrift", "## Konklusion: BACKUP VERIFICERET", true],
    ["tabulator og ekstra mellemrum", "**Konklusion:\t  BACKUP   VERIFICERET**  ", true],
    ["hårdt mellemrum (U+00A0)", "**Konklusion:\u00a0BACKUP\u00a0VERIFICERET**", true],
    ["IKKE foran", "**Konklusion: IKKE BACKUP VERIFICERET**", false],
    ["IKKE i midten", "**Konklusion: BACKUP IKKE VERIFICERET**", false],
    ["ikke i forbeholdet", "**Konklusion: BACKUP VERIFICERET** men data er ikke kontrolleret.", false],
    ["foreløbig", "**Konklusion: BACKUP VERIFICERET (foreløbig)**", false],
    ["FORELØBIG med stort", "**Konklusion: BACKUP VERIFICERET — FORELØBIG**", false],
    ["delvis", "**Konklusion: BACKUP VERIFICERET delvis**", false],
    ["spørgsmålstegn", "**Konklusion: BACKUP VERIFICERET?**", false],
    ["fejl i forbeholdet", "**Konklusion: BACKUP VERIFICERET**, med fejl i data.sql", false],
    ["engelsk not", "**Konklusion: BACKUP VERIFICERET** — not for restore", false],
    ["sammenskrevet ord", "**Konklusion: BACKUP VERIFICERETX**", false],
    ["anden konklusion", "**Konklusion: BACKUP AFVIST**", false],
    ["tom konklusion", "**Konklusion:**", false],
  ];
  const reportCases = [
    ["ingen konklusionslinje, kun ordene i brødteksten", lines("# Verifikation", "", "Status: BACKUP VERIFICERET", "`expected-counts-%C%`"), false],
    ["to konklusioner, modstridende", lines("# V", REAL_CONCLUSION, "**Konklusion: IKKE BACKUP VERIFICERET**", "`expected-counts-%C%`"), false],
    ["to konklusioner, begge positive", lines("# V", REAL_CONCLUSION, "Konklusion: BACKUP VERIFICERET", "`expected-counts-%C%`"), false],
    ["CRLF-linjeskift i hele rapporten", lines("# V", "", REAL_CONCLUSION, "Det giver ikke GO til K1.", "`expected-counts-%C%`: OK.").replace(/\n/g, "\r\n"), true],
    ["tom rapport", "", false],
  ];
  try {
    const all = [...cases.map(([d, c, ok]) => ({ d, c, ok })), ...reportCases.map(([d, r, ok]) => ({ d, r, ok }))];
    all.forEach((c, i) => {
      const name = `dump-202611${String(10 + Math.floor(i / 10)).padStart(2, "0")}T${String(100000 + (i % 10) * 100)}Z`;
      const stamp = name.slice(5, 18);
      const counts = `expected-counts-${stamp.slice(0, 9)}${stamp.slice(9, 13)}Z.json`;
      makeDump(k.dir, name, c.r !== undefined ? { report: c.r.replace("%C%", counts) } : { conclusion: c.c });
      c.name = name;
    });
    for (const c of all) {
      const r = run(k, ["--vis", c.name]);
      if (c.ok) assert.equal(r.status, 0, `${c.d} skulle godkendes: ${r.err}`);
      else {
        assert.equal(r.status, 3, `${c.d} skulle afvises: ${r.out}`);
        assert.match(r.err, /springer over .*VERIFIKATION-.*\.md (har|konklusionen)/, `${c.d}: ${r.err}`);
      }
    }
  } finally { cleanup(k); }
});

// ── Valget af dump ─────────────────────────────────────────────────────────

test("valget: den nyeste VERIFICEREDE dump; nyere fejlede, uverificerede eller ændrede springes over, og valget siges at være ældre", { skip: SKIP }, () => {
  const k = kit();
  try {
    makeDump(k.dir, "dump-20261101T080000Z");
    makeDump(k.dir, "dump-20261106T100041Z");                         // den seneste gyldige
    makeDump(k.dir, "dump-20261107T090000Z-FEJLET");
    makeDump(k.dir, "dump-20261108T090000Z", { kind: "fejlmarkeret" });
    makeDump(k.dir, "dump-20261109T090000Z", { kind: "uverificeret" });
    makeDump(k.dir, "dump-20261110T090000Z", { kind: "forkert-sum" });
    makeDump(k.dir, "dump-20261111T090000Z", { kind: "to-taellinger" });
    makeDump(k.dir, "dump-20261112T090000Z", { conclusion: "**Konklusion: IKKE BACKUP VERIFICERET**" });
    makeDump(k.dir, "dump-20261113T090000Z", { extra: { "noter.txt": "hej\n" } });
    const before = snapshot(k.dir);
    const r = run(k, ["--vis"]);
    assert.equal(r.status, 0, r.err);
    assert.match(r.out, /Valgt dump: dump-20261106T100041Z \(verifikation VERIFIKATION-dump-20261106T100041Z\.md, tællinger expected-counts-20261106T1000Z\.json\)/);
    assert.match(r.out, /Backuppen er taget 2026-11-06 10:00:41 UTC — for \d+ timer siden \(\d+ døgn\)\./);
    assert.match(r.out, /ADVARSEL: den valgte dump er IKKE den nyeste\. Nyere dumps, der ikke er verificerede og derfor er sprunget over: dump-20261113T090000Z dump-20261112T090000Z dump-20261111T090000Z dump-20261110T090000Z dump-20261109T090000Z dump-20261108T090000Z dump-20261107T090000Z-FEJLET/);
    for (const [name, why] of [
      ["dump-20261113T090000Z", "fil uden for reglen: noter.txt"], ["dump-20261112T090000Z", "konklusionen er ikke"],
      ["dump-20261111T090000Z", "præcis én expected-counts-fil"], ["dump-20261110T090000Z", "SHA256SUMS stemmer ikke"],
      ["dump-20261109T090000Z", "ikke verificeret"], ["dump-20261108T090000Z", "mærket FEJLET"],
      ["dump-20261107T090000Z-FEJLET", "navnet er ikke"]]) {
      assert.ok(r.err.split("\n").some((l) => l.includes(`springer over ${name}:`) && l.includes(why)), `${name}: ${r.err}`);
    }
    assert.equal(snapshot(k.dir), before, "--vis ændrer intet i kittet");
    assert.deepEqual(readdirSync(k.target), [], "--vis skriver intet på målet");
  } finally { cleanup(k); }
});

test("den nyeste er verificeret: ingen advarsel, men tidspunktet står der altid", { skip: SKIP }, () => {
  const k = kit();
  try {
    makeDump(k.dir, "dump-20261101T080000Z");
    makeDump(k.dir, "dump-20261106T100041Z");
    const r = run(k, ["--vis"]);
    assert.equal(r.status, 0, r.err);
    assert.doesNotMatch(r.out, /ADVARSEL/);
    assert.match(r.out, /Backuppen er taget 2026-11-06 10:00:41 UTC/);
  } finally { cleanup(k); }
});

test("et bestemt navn: en verificeret dump kan vælges, en uverificeret, ukendt eller en sti afvises", { skip: SKIP }, () => {
  const k = kit();
  try {
    makeDump(k.dir, "dump-20261101T080000Z");
    makeDump(k.dir, "dump-20261106T100041Z");
    makeDump(k.dir, "dump-20261109T090000Z", { kind: "uverificeret" });
    const old = run(k, ["--vis", "dump-20261101T080000Z"]);
    assert.match(old.out, /Valgt dump: dump-20261101T080000Z/);
    assert.match(old.out, /Backuppen er taget 2026-11-01 08:00:00 UTC/);
    const bad = run(k, ["--vis", "dump-20261109T090000Z"]);
    assert.equal(bad.status, 3);
    assert.match(bad.err, /AFVIST: dump-20261109T090000Z er ikke en verificeret dump/);
    assert.equal(run(k, ["--vis", "../dump-20261106T100041Z"]).status, 3, "kun navne, aldrig stier");
    assert.equal(run(k, ["--vis", "dump-20990101T000000Z"]).status, 3);
  } finally { cleanup(k); }
});

test("ingen verificeret dump: stop uden at skrive noget", { skip: SKIP }, () => {
  const k = kit();
  try {
    makeDump(k.dir, "dump-20261109T090000Z", { kind: "uverificeret" });
    makeDump(k.dir, "dump-20261107T090000Z-FEJLET");
    const r = run(k, [k.target]);
    assert.equal(r.status, 3);
    assert.match(r.err, /AFVIST: ingen verificeret dump fundet/);
    assert.deepEqual(readdirSync(k.target), []);
  } finally { cleanup(k); }
});

// ── Fase 3: filreglen for dump-mappen ─────────────────────────────────────

test("filreglen: en ekstra fil, en undermappe, en løs .stderr.txt eller et ugyldigt navn i SHA256SUMS afviser dumpen", { skip: SKIP }, () => {
  const k = kit();
  try {
    makeDump(k.dir, "dump-20261101T080000Z", { extra: { "noter.txt": "ekstra\n" } });
    makeDump(k.dir, "dump-20261102T080000Z", { extra: { "undermappe": null } });
    makeDump(k.dir, "dump-20261103T080000Z", { extra: { "andet.sql.stderr.txt": "" } });
    makeDump(k.dir, "dump-20261104T080000Z", { extra: { "data.sql.bak": "kopi\n" } });
    const sneaky = makeDump(k.dir, "dump-20261105T080000Z");
    writeFileSync(join(sneaky.dir, "SHA256SUMS"), readFileSync(join(sneaky.dir, "SHA256SUMS"), "utf8") + `${sha("x")} *../README.md\r\n`);
    for (const [name, why] of [
      ["dump-20261101T080000Z", "fil uden for reglen: noter.txt"],
      ["dump-20261102T080000Z", "ikke er en almindelig fil: undermappe"],
      ["dump-20261103T080000Z", "fil uden for reglen: andet.sql.stderr.txt"],
      ["dump-20261104T080000Z", "fil uden for reglen: data.sql.bak"],
      ["dump-20261105T080000Z", "ugyldigt filnavn"]]) {
      const r = run(k, ["--vis", name]);
      assert.equal(r.status, 3, `${name}: ${r.out}`);
      assert.ok(r.err.includes(why), `${name}: ${r.err}`);
    }
  } finally { cleanup(k); }
});

// ── Kryptering ─────────────────────────────────────────────────────────────

test("kryptering: kun .tar.gpg + .sha256 på målet; arkivet er præcis dumpens filer (data, metadata, SHA256SUMS) og bilagene; dekrypterbart; intet ændret", { skip: SKIP, timeout: 120000 }, () => {
  const k = kit();
  try {
    makeDump(k.dir, "dump-20261101T080000Z");
    const { files } = makeDump(k.dir, "dump-20261106T100041Z");
    makeDump(k.dir, "dump-20261109T090000Z", { kind: "uverificeret" });
    const before = snapshot(k.dir);
    const r = run(k, [posix(k.target)]);
    assert.equal(r.status, 0, r.err + r.out);
    assert.match(r.out, /FÆRDIG: krypteret kopi af dumpen fra 2026-11-06 10:00:41 UTC verificeret/);
    assert.match(r.out, /ADVARSEL: den valgte dump er IKKE den nyeste/);
    for (const f of Object.keys(files)) assert.ok(r.out.includes(`OK  dump-20261106T100041Z/${f}`), f);
    assert.deepEqual(readdirSync(k.target).sort(), ["laerlig-dump-20261106T100041Z.tar.gpg", "laerlig-dump-20261106T100041Z.tar.gpg.sha256"],
      "ingen ukrypteret eller ufuldstændig kopi på målet");
    const out = join(k.target, "laerlig-dump-20261106T100041Z.tar.gpg");
    const want = ["README.md", "VERIFIKATION-dump-20261106T100041Z.md", "dump-20261106T100041Z-tillaeg.sql",
      "expected-counts-20261106T1000Z.json", "verify-backup.mjs", "dump-20261106T100041Z/SHA256SUMS", "dump-20261106T100041Z/RUN-INFO.txt",
      ...Object.keys(files).flatMap((f) => [`dump-20261106T100041Z/${f}`, `dump-20261106T100041Z/${f}.stderr.txt`])].sort();
    assert.deepEqual(decryptListing(k, out), want);
    const sum = readFileSync(`${out}.sha256`, "utf8").split(/\s+/)[0];
    assert.equal(sum, sha(readFileSync(out)), ".sha256 passer til kopien");
    const wrongPass = spawnSync(BASH, ["-c", `"${GPG}" --batch --pinentry-mode loopback --passphrase forkert --quiet -d "${posix(out)}" >/dev/null`],
      { encoding: "utf8", env: { ...process.env, GNUPGHOME: posix(k.gnupg) } });
    assert.notEqual(wrongPass.status, 0, "en forkert adgangskode åbner ikke kopien");
    assert.equal(snapshot(k.dir), before, "kittet og alle dumps er uændrede");
    // Køres igen: intet overskrives.
    const again = run(k, [posix(k.target)]);
    assert.equal(again.status, 3);
    assert.match(again.err, /findes allerede\. Intet overskrives/);
    assert.equal(readFileSync(`${out}.sha256`, "utf8").split(/\s+/)[0], sha(readFileSync(out)));
  } finally { cleanup(k); }
});

// En gpg-stand-in: krypterer/dekrypterer med den rigtige gpg, men kan fejle midt i krypteringen eller
// returnere et ændret arkiv ved dekryptering. Kun syntetiske data i midlertidige mapper.
function fakeGpg(k, mode) {
  const p = join(k.gnupg, "falsk-gpg.sh");
  writeFileSync(p, `#!/usr/bin/env bash
real="${GPG}"
for a in "$@"; do
  if [ "$a" = "--symmetric" ] && [ "${mode}" = "afbryd" ]; then
    out=""; prev=""; for b in "$@"; do [ "$prev" = "-o" ] && out="$b"; prev="$b"; done
    head -c 100 > "$out"; echo "gpg: afbrudt" >&2; exit 2
  fi
  if [ "$a" = "-d" ] && [ "${mode}" = "manipuler" ]; then
    t="$(mktemp -d)"; "$real" "$@" | tar -xf - -C "$t"; printf 'x' >> "$t/README.md"; (cd "$t" && tar -cf - *); exit 0
  fi
done
exec "$real" "$@"
`, { mode: 0o755 });
  return posix(p);
}

test("en afbrudt kryptering rapporteres aldrig som vellykket og efterlader intet på målet", { skip: SKIP, timeout: 120000 }, () => {
  const k = kit();
  try {
    makeDump(k.dir, "dump-20261106T100041Z");
    const r = run(k, [posix(k.target)], { GPG_BIN: fakeGpg(k, "afbryd") });
    assert.notEqual(r.status, 0);
    assert.doesNotMatch(r.out, /FÆRDIG/);
    assert.match(r.err, /Den ufuldstændige fil er fjernet\. Intet blev gemt\./);
    assert.deepEqual(readdirSync(k.target), [], "hverken kopi, ufuldstændig fil eller .sha256");
  } finally { cleanup(k); }
});

test("et arkiv, der ved dekryptering ikke svarer til listen, afvises; intet gemmes", { skip: SKIP, timeout: 120000 }, () => {
  const k = kit();
  try {
    makeDump(k.dir, "dump-20261106T100041Z");
    const r = run(k, [posix(k.target)], { GPG_BIN: fakeGpg(k, "manipuler") });
    assert.equal(r.status, 4, r.err + r.out);
    assert.match(r.err, /IKKE VERIFICERET: arkivets indhold afviger fra listen/);
    assert.doesNotMatch(r.out, /FÆRDIG/);
    assert.deepEqual(readdirSync(k.target), []);
  } finally { cleanup(k); }
});

test("målet: C:, synkroniserede mapper, et manglende drev og en eksisterende kopi, .sha256 eller ufuldstændig fil afvises urørt", { skip: SKIP }, () => {
  const k = kit();
  try {
    makeDump(k.dir, "dump-20261106T100041Z");
    const env = { ...process.env, KRYPTER_BACKUP_DIR: posix(k.dir), GPG_BIN: GPG };
    for (const c of ["C:", "C:/Users/x", "c:\\backup"]) {
      const noC = spawnSync(BASH, [posix(SCRIPT), c], { encoding: "utf8", env });
      assert.equal(noC.status, 3, c);
      assert.match(noC.stderr, /målet ligger på C:/, c);
    }
    for (const s of ["E:/OneDrive/backup", "E:/Dropbox", "E:/Google Drive/x", "E:/iCloud Drive"]) assert.match(run(k, [s]).err, /synkroniseret mappe/, s);
    assert.match(run(k, [posix(join(k.target, "findes-ikke"))]).err, /findes ikke/);
    for (const existing of ["laerlig-dump-20261106T100041Z.tar.gpg", "laerlig-dump-20261106T100041Z.tar.gpg.sha256",
      "laerlig-dump-20261106T100041Z.tar.gpg.ufuldstaendig"]) {
      writeFileSync(join(k.target, existing), "gammel");
      const r = run(k, [posix(k.target)]);
      assert.equal(r.status, 3, existing);
      assert.match(r.err, /findes allerede\. Intet overskrives/);
      assert.equal(readFileSync(join(k.target, existing), "utf8"), "gammel", `${existing} er urørt`);
      rmSync(join(k.target, existing));
    }
  } finally { cleanup(k); }
});

// ── Statisk ────────────────────────────────────────────────────────────────

test("scriptet sletter, flytter eller skriver kun sin egen ufuldstændige fil og sin .sha256 — aldrig en dump", () => {
  const code = readFileSync(SCRIPT, "utf8").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  const rm = code.match(/\brm\s[^\n;]*/g) ?? [];
  assert.deepEqual(rm, ['rm -f -- "$PART"'], "eneste rm er den ufuldstændige fil fra samme kørsel");
  assert.match(code, /if \[ "\$created" = "1" \] && \[ -e "\$PART" \]; then rm -f -- "\$PART"/);
  const mv = code.match(/\bmv\s[^\n;]*/g) ?? [];
  assert.deepEqual(mv, ['mv -n -- "$PART" "$OUT"'], "eneste mv giver kopien sit navn, uden at overskrive");
  assert.equal(/\b(shred|truncate|unlink)\s/.test(code), false);
  assert.equal(/--passphrase\b/.test(code), false, "ingen adgangskode i scriptet");
  const writes = code.split("\n").filter((l) => /(^|[^2&])>\s*"/.test(l));
  assert.equal(writes.length, 1, writes.join("\n"));
  assert.match(writes[0], /cd "\$TARGET" && sha256sum "\$\(basename "\$OUT"\)" > "\$\(basename "\$OUT"\)\.sha256"/);
  assert.match(code, /-o "\$PART"/, "gpg skriver kun den ufuldstændige fil");
  assert.match(code, /tar -cf - -- "\$\{FILES\[@\]\}"/, "enkeltfiler, aldrig en hel mappe");
});
