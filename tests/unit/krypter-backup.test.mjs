// tools/backup/krypter-backup.sh — valget af den seneste VERIFICEREDE dump og krypteringen, kørt på FALSKE
// backupmapper i en midlertidig mappe. Ingen produktionsdata, ingen rigtig backup og ingen rigtig adgangskode:
// gpg får en testadgangskode via KRYPTER_TEST_GPG_OPTS og et eget, midlertidigt GNUPGHOME.
// Springes over, hvis bash, gpg, tar eller sha256sum mangler (CI's ubuntu-runner har dem alle).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, rmSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "tools", "backup", "krypter-backup.sh");
const WIN = process.platform === "win32";
const BASH = WIN ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const GPG = WIN ? "/c/Program Files/Git/usr/bin/gpg.exe" : "gpg";
const has = (cmd) => spawnSync(BASH, ["-c", `command -v "${cmd}" >/dev/null`]).status === 0;
const SKIP = spawnSync(BASH, ["-c", "true"]).status !== 0 ? "bash mangler"
  : !["tar", "sha256sum", "find"].every(has) ? "tar/sha256sum/find mangler"
  : spawnSync(BASH, ["-c", `"${GPG}" --version >/dev/null`]).status !== 0 ? "gpg mangler" : false;

const sha = (s) => createHash("sha256").update(s).digest("hex");
const posix = (p) => (WIN ? p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`) : p);

// En falsk backupmappe. kind: "ok" | "fejlet" (navn -FEJLET) | "fejlmarkeret" (FEJLET.txt) | "uverificeret"
// | "forkert-sum" | "to-taellinger" | "ikke-verificeret-tekst".
function makeDump(dir, name, kind = "ok") {
  const d = join(dir, name);
  mkdirSync(d);
  const files = { "roles.sql": `-- roller ${name}\n`, "schema.sql": `-- skema ${name}\n`, "data.sql": `-- data ${name} æøå\n`, "migration-ledger.sql": "-- ledger\n" };
  for (const [f, c] of Object.entries(files)) writeFileSync(join(d, f), c);
  const sums = Object.entries(files).map(([f, c]) => `${kind === "forkert-sum" && f === "data.sql" ? sha("andet") : sha(c)} *${f}`).join("\n") + "\n";
  writeFileSync(join(d, "SHA256SUMS"), sums);
  if (kind === "fejlmarkeret") writeFileSync(join(d, "FEJLET.txt"), "fejlet\n");
  const stamp = name.slice(5, 18);   // ÅÅÅÅMMDDTTTMM
  const counts = `expected-counts-${stamp.slice(0, 9)}${stamp.slice(9, 13)}Z.json`;
  writeFileSync(join(dir, counts), "{}\n");
  if (kind !== "uverificeret") {
    const verdict = kind === "ikke-verificeret-tekst" ? "**Konklusion: IKKE GODKENDT**" : "**Konklusion: BACKUP VERIFICERET**";
    const extra = kind === "to-taellinger" ? " og `expected-counts-20200101T0000Z.json`" : "";
    writeFileSync(join(dir, `VERIFIKATION-${name}.md`), `# Verifikation af backup ${name}\n\n${verdict}\n\n\`verify-backup.mjs\` med \`${counts}\`${extra}: OK.\n`);
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
function run(k, args) {
  const r = spawnSync(BASH, [posix(SCRIPT), ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      KRYPTER_BACKUP_DIR: posix(k.dir),
      GPG_BIN: GPG,
      GNUPGHOME: posix(k.gnupg),
      KRYPTER_TEST_GPG_OPTS: "--batch --yes --pinentry-mode loopback --passphrase kun-en-test",
      KRYPTER_TEST_TILLAD_C: "1",
    },
  });
  return { status: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}
const cleanup = (k) => { for (const d of [k.dir, k.target, k.gnupg]) rmSync(d, { recursive: true, force: true }); };

test("valget: den nyeste VERIFICEREDE dump; nyere fejlede, uverificerede eller ændrede springes over", { skip: SKIP }, () => {
  const k = kit();
  try {
    makeDump(k.dir, "dump-20261101T080000Z");
    makeDump(k.dir, "dump-20261106T100041Z");                         // den seneste gyldige
    makeDump(k.dir, "dump-20261107T090000Z-FEJLET");
    makeDump(k.dir, "dump-20261108T090000Z", "fejlmarkeret");
    makeDump(k.dir, "dump-20261109T090000Z", "uverificeret");
    makeDump(k.dir, "dump-20261110T090000Z", "forkert-sum");
    makeDump(k.dir, "dump-20261111T090000Z", "to-taellinger");
    makeDump(k.dir, "dump-20261112T090000Z", "ikke-verificeret-tekst");
    const before = readdirSync(k.dir).sort();
    const r = run(k, ["--vis"]);
    assert.equal(r.status, 0, r.err);
    assert.match(r.out, /Valgt dump: dump-20261106T100041Z \(verifikation VERIFIKATION-dump-20261106T100041Z\.md, tællinger expected-counts-20261106T1000Z\.json\)/);
    for (const [name, why] of [
      ["dump-20261112T090000Z", "siger ikke BACKUP VERIFICERET"], ["dump-20261111T090000Z", "præcis én expected-counts-fil"],
      ["dump-20261110T090000Z", "SHA256SUMS stemmer ikke"], ["dump-20261109T090000Z", "ikke verificeret"],
      ["dump-20261108T090000Z", "mærket FEJLET"], ["dump-20261107T090000Z-FEJLET", "navnet er ikke"]]) {
      assert.ok(r.err.split("\n").some((l) => l.includes(`springer over ${name}:`) && l.includes(why)), `${name}: ${r.err}`);
    }
    assert.deepEqual(readdirSync(k.dir).sort(), before, "--vis ændrer intet");
    assert.deepEqual(readdirSync(k.target), [], "--vis skriver intet");
  } finally { cleanup(k); }
});

test("et bestemt navn: en verificeret dump kan vælges, en uverificeret eller ukendt afvises", { skip: SKIP }, () => {
  const k = kit();
  try {
    makeDump(k.dir, "dump-20261101T080000Z");
    makeDump(k.dir, "dump-20261106T100041Z");
    makeDump(k.dir, "dump-20261109T090000Z", "uverificeret");
    assert.match(run(k, ["--vis", "dump-20261101T080000Z"]).out, /Valgt dump: dump-20261101T080000Z/);
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
    makeDump(k.dir, "dump-20261109T090000Z", "uverificeret");
    makeDump(k.dir, "dump-20261107T090000Z-FEJLET");
    const r = run(k, [k.target]);
    assert.equal(r.status, 3);
    assert.match(r.err, /AFVIST: ingen verificeret dump fundet/);
    assert.deepEqual(readdirSync(k.target), []);
  } finally { cleanup(k); }
});

test("målet: C:, synkroniserede mapper, et manglende drev og en eksisterende kopi afvises", { skip: SKIP }, () => {
  const k = kit();
  try {
    makeDump(k.dir, "dump-20261106T100041Z");
    const env = { ...process.env, KRYPTER_BACKUP_DIR: posix(k.dir), GPG_BIN: GPG };
    const noC = spawnSync(BASH, [posix(SCRIPT), "C:"], { encoding: "utf8", env });
    assert.equal(noC.status, 3);
    assert.match(noC.stderr, /målet ligger på C:/);
    assert.match(run(k, ["E:/OneDrive/backup"]).err, /synkroniseret mappe/);
    assert.match(run(k, [posix(join(k.target, "findes-ikke"))]).err, /findes ikke/);
    writeFileSync(join(k.target, "laerlig-dump-20261106T100041Z.tar.gpg"), "gammel");
    assert.match(run(k, [posix(k.target)]).err, /findes allerede/);
  } finally { cleanup(k); }
});

test("kryptering: én .tar.gpg + .sha256, kopien kan dekrypteres og indeholder netop dumpen og dens bilag", { skip: SKIP, timeout: 120000 }, () => {
  const k = kit();
  try {
    makeDump(k.dir, "dump-20261101T080000Z");
    const { files } = makeDump(k.dir, "dump-20261106T100041Z");
    makeDump(k.dir, "dump-20261109T090000Z", "uverificeret");
    const before = Object.fromEntries(readdirSync(join(k.dir, "dump-20261106T100041Z")).map((f) => [f, readFileSync(join(k.dir, "dump-20261106T100041Z", f), "utf8")]));
    const r = run(k, [posix(k.target)]);
    assert.equal(r.status, 0, r.err + r.out);
    assert.match(r.out, /FÆRDIG: krypteret kopi verificeret/);
    for (const f of Object.keys(files)) assert.ok(r.out.includes(`OK  ${f}`), f);
    assert.deepEqual(readdirSync(k.target).sort(), ["laerlig-dump-20261106T100041Z.tar.gpg", "laerlig-dump-20261106T100041Z.tar.gpg.sha256"],
      "ingen ukrypteret kopi på målet");
    const gpgFile = posix(join(k.target, "laerlig-dump-20261106T100041Z.tar.gpg"));
    const listing = spawnSync(BASH, ["-c", `"${GPG}" --batch --pinentry-mode loopback --passphrase kun-en-test --quiet -d "${gpgFile}" | tar -tf -`],
      { encoding: "utf8", env: { ...process.env, GNUPGHOME: posix(k.gnupg) } });
    assert.equal(listing.status, 0, listing.stderr);
    const names = listing.stdout.split(/\r?\n/).filter(Boolean).map((n) => n.replace(/\/$/, "")).sort();
    assert.deepEqual(names, [
      "README.md", "VERIFIKATION-dump-20261106T100041Z.md", "dump-20261106T100041Z",
      "dump-20261106T100041Z-tillaeg.sql", "dump-20261106T100041Z/SHA256SUMS", "dump-20261106T100041Z/data.sql",
      "dump-20261106T100041Z/migration-ledger.sql", "dump-20261106T100041Z/roles.sql", "dump-20261106T100041Z/schema.sql",
      "expected-counts-20261106T1000Z.json", "verify-backup.mjs"].sort());
    const wrongPass = spawnSync(BASH, ["-c", `"${GPG}" --batch --pinentry-mode loopback --passphrase forkert --quiet -d "${gpgFile}" >/dev/null`],
      { encoding: "utf8", env: { ...process.env, GNUPGHOME: posix(k.gnupg) } });
    assert.notEqual(wrongPass.status, 0, "en forkert adgangskode åbner ikke kopien");
    const after = Object.fromEntries(readdirSync(join(k.dir, "dump-20261106T100041Z")).map((f) => [f, readFileSync(join(k.dir, "dump-20261106T100041Z", f), "utf8")]));
    assert.deepEqual(after, before, "dumpen er uændret");
    assert.ok(existsSync(join(k.dir, "dump-20261109T090000Z")), "intet slettes eller flyttes");
  } finally { cleanup(k); }
});

test("scriptet sletter, flytter eller omdøber aldrig noget og skriver kun på målet", { skip: false }, () => {
  const code = readFileSync(SCRIPT, "utf8").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  assert.equal(/\b(rm|mv|shred|truncate|unlink)\s/.test(code), false);
  assert.equal(/--passphrase\b/.test(code), false, "ingen adgangskode i scriptet");
  // Den eneste omdirigering til en fil er kopiens .sha256 på målet (gpg skriver selv kopien med -o).
  const writes = code.split("\n").filter((l) => /(^|[^2&])>\s*"/.test(l));
  assert.equal(writes.length, 1, writes.join("\n"));
  assert.match(writes[0], /cd "\$TARGET" && sha256sum "\$\(basename "\$OUT"\)" > "\$\(basename "\$OUT"\)\.sha256"/);
  assert.match(code, /-o "\$OUT"/);
});
