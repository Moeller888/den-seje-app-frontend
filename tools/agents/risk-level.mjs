// tools/agents/risk-level.mjs — deterministisk risikoniveau for en ændring (AURA T1).
// Politikken står i docs/operations/autonomy-levels.md. Kontrakten i tests/unit/agent-risk-level.test.mjs.
//
// Formål: en agent må ikke selv kunne klassificere en sikkerhedskritisk ændring som lav risiko. Niveauet
// beregnes derfor ud fra stier og tilføjede linjer, og agentens eget skøn kan kun HÆVE niveauet, aldrig sænke
// det. Ukendte stier giver niveau 2 (fail closed), og alt, der er ejet i .github/CODEOWNERS, er mindst niveau 2.
//
//   1 = fuld automatik      (implementering, test, PR uden nyt GO)
//   2 = betinget automatik  (stærkere test og ejerens bekræftelse før merge)
//   3 = menneskelig godkendelse (ejeren beslutter; agenten forbereder kun)
//
// Værktøjet læser kun. Det kører aldrig git-skrivninger, netværkskald eller GitHub-kald.
//
// Brug:
//   node tools/agents/risk-level.mjs [--base origin/main] [--declared 1|2|3] [--json]
//   git diff origin/main...HEAD | node tools/agents/risk-level.mjs --stdin
// Exitkode = niveauet (1, 2 eller 3); 64 = forkert brug. En kalder kan dermed ikke misforstå resultatet.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------------------------
// CODEOWNERS: et forankret, gitignore-lignende mønster → RegExp. Kun den delmængde, filen bruger.
// ---------------------------------------------------------------------------------------------
export function patternToRegExp(pattern) {
  if (typeof pattern !== "string" || pattern.length === 0) throw new Error("tomt CODEOWNERS-mønster");
  let p = pattern;
  const anchored = p.startsWith("/") || p.slice(0, -1).includes("/");
  if (p.startsWith("/")) p = p.slice(1);
  const dirOnly = p.endsWith("/");
  if (dirOnly) p = p.slice(0, -1);
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*" && p[i + 1] === "*") {
      if (p[i + 2] === "/") { re += "(?:.*/)?"; i += 2; } else { re += ".*"; i += 1; }
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  const prefix = anchored ? "^" : "^(?:.*/)?";
  // En mappe (eller et mønster uden glob til sidst) dækker alt under sig, ligesom i GitHub.
  const suffix = dirOnly ? "/.*$" : "(?:/.*)?$";
  return new RegExp(prefix + re + suffix);
}

export function parseCodeowners(text) {
  const rules = [];
  for (const [n, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const [pattern, ...owners] = line.split(/\s+/);
    rules.push({ line: n + 1, pattern, owners, re: patternToRegExp(pattern) });
  }
  return rules;
}

// Den sidste regel, der matcher, vinder (GitHubs semantik). Returnerer ejerne eller [].
export function ownersFor(rules, path) {
  let owners = [];
  for (const r of rules) if (r.re.test(path)) owners = r.owners;
  return owners;
}

export function loadCodeowners(root = REPO_ROOT) {
  return parseCodeowners(readFileSync(join(root, ".github", "CODEOWNERS"), "utf8"));
}

// ---------------------------------------------------------------------------------------------
// Stier. Rækkefølgen er: niveau 3 → ejet (≥ 2) → niveau 2 → niveau 1 → ukendt (2).
// ---------------------------------------------------------------------------------------------
// Niveau 3: ejeren beslutter. Skal være en delmængde af CODEOWNERS (testet).
export const LEVEL3_PATHS = Object.freeze([
  "/.github/", "/.claude/", "/CLAUDE.md", "/AGENTS.md", "/docs/CLAUDE_WORKFLOW.md", "/docs/AI_GUIDELINES.md",
  "/docs/migration-workflow-policy.md", "/fix-tests.ps1", "/tools/agents/",
  "/docs/operations/*runbook*", "/docs/operations/e2e-prod-*.md", "/docs/operations/agent-*.md",
  "/docs/operations/autonomy-levels.md",
  "/supabase/config.toml", "/tools/e2e/", "/tools/e2e-safety/", "/tools/backup/", "/tools/cloudflare-deploy.mjs",
  "/worker/", "/wrangler.jsonc", "/js/supabase.js", "/supabaseClient.js", "/.gitignore", "/.env.example",
  "/tests/e2e-accounts.mjs", "/tests/e2e-admin.mjs", "/tests/e2e-guard.mjs", "/tests/e2e-slot.mjs",
  "/tests/test-credentials.mjs", "/tests/global-setup.ts", "/tests/helpers.ts",
  "/tests/isolated/isolation-guard.mjs", "/tests/isolated/egress-*", "/tests/isolated/negative-controls.sh",
  "/tests/isolated/cdn-*.mjs", "/tests/isolated/ci/", "/tests/isolated/seed/",
  "/tests/run-unit-ci.mjs", "/tests/unit-ci-exclusions.mjs", "/playwright.config.ts",
  "/tests/unit/ci-*.test.mjs", "/tests/unit/claude-settings-guard.test.mjs", "/tests/unit/credential-hygiene.test.mjs",
  "/tests/unit/e2e-*.test.mjs", "/tests/unit/isolated-*.test.mjs", "/tests/unit/migration-workflow-policy.test.mjs",
  "/tests/unit/agent-*.test.mjs", "/tests/unit/codeowners.test.mjs", "/tests/unit/password-help-mail-guard.test.mjs",
  "/tests/unit/profiles-self-update-columns-guard.test.mjs", "/tests/unit/d237-guard-exception.test.mjs",
]);

// Niveau 2 uden ejerskab: belønning, bedømmelse, login, elevdata, aktiveringsflag, privatliv og betalte kald.
export const LEVEL2_PATHS = Object.freeze([
  "/app.js", "/js/progression.js", "/js/answer-submission.js", "/js/quiz-cooldown.js", "/js/flags.js",
  "/js/login.js", "/login.html", "/js/reset-password.js", "/reset-password.html",
  "/js/admin.js", "/admin.html", "/js/teacher.js", "/js/student-detail.js", "/js/storage.js",
  "/js/consent.js", "/js/analytics.js", "/js/analytics-consent.js", "/js/sentry.js",
  "/tools/avatar-batch/", "/tools/read-aloud/", "/tools/replay-harness/", "/tools/questions/",
  "/tests/isolated/schema/", "/docs/operations/*.md", "/docs/operations/*.json",
  "/**/*.sql", "/package-lock.json",
]);

// Append-only: en NY fil her er niveau 1; en ændret, omdøbt eller slettet eksisterende fil er niveau 2.
export const APPEND_ONLY_PATHS = Object.freeze(["/docs/operations/production-actions/"]);

// Niveau 1: eksplicit tilladt. Alt andet, der ikke er nævnt, er niveau 2.
export const LEVEL1_PATHS = Object.freeze([
  "/*.html", "/style.css", "/css/", "/assets/", "/js/", "/docs/", "/data/",
  "/tests/*.spec.ts", "/tests/*-snapshots/", "/tests/fixtures/", "/tests/support/", "/tests/c2-golden/", "/tests/unit/",
  "/tests/isolated/", "/tests/offline-specs.mjs",
  "/laerligverse/", "/adventure-engine/", "/packages/", "/tools/avatar/", "/tools/question-cli/",
  "/tools/question-quality/", "/tools/question-mix-sim/", "/tools/true-false/", "/tools/match-pairs/",
  "/tools/stimulus/", "/tools/laerligverse/", "/tools/decisions/", "/tools/ci/",
]);

const compile = (list) => list.map((p) => ({ pattern: p, re: patternToRegExp(p) }));
const L3 = compile(LEVEL3_PATHS), L2 = compile(LEVEL2_PATHS), L1 = compile(LEVEL1_PATHS), AO = compile(APPEND_ONLY_PATHS);
const hit = (list, path) => list.find((x) => x.re.test(path))?.pattern ?? null;

// ---------------------------------------------------------------------------------------------
// Indhold: kun TILFØJEDE linjer. Signalerne kan kun hæve niveauet.
//   scope "alle"  = gælder i alle filer, også test, Markdown og kommentarer (en rigtig hemmelighed er altid alvorlig)
//   scope "kode"  = gælder kun i kørbar kode uden for test og dokumentation, og ikke i rene kommentarlinjer
// Test uden ejer kører aldrig automatisk mod produktionen (prod-E2E kræver dispatch og godkendelse i e2e-prod),
// så deres SQL-strenge og nøglenavne er test-fixtures, ikke adgang.
// ---------------------------------------------------------------------------------------------
export const CONTENT_SIGNALS = Object.freeze([
  { level: 3, scope: "alle", id: "secret-literal", re: /sb_secret_[A-Za-z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|\bghp_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/ },
  { level: 3, scope: "alle", id: "guard-omgåelse", re: /--no-verify\b|dangerouslyDisableSandbox|\[skip ci\]|\[ci skip\]|gh pr merge[^\n]*--admin\b/i },
  { level: 3, scope: "kode", id: "secret-nøgle", re: /service[_-]?role|sb_secret_|SUPABASE_SERVICE/i },
  { level: 3, scope: "kode", id: "github-secret", re: /\$\{\{\s*secrets\./ },
  { level: 3, scope: "kode", id: "auth-admin", re: /auth\.admin\b|\bauth\.users\b/ },
  { level: 3, scope: "kode", id: "destruktiv-sql", re: /\b(?:drop\s+(?:table|schema|function|policy|trigger|column|view|index)|truncate\b|delete\s+from|alter\s+table\b[^;]*\bdrop\b)/i },
  { level: 3, scope: "kode", id: "rettigheder-sql", re: /\b(?:grant|revoke)\b[^;]*\b(?:on|to|from)\b|\bsecurity\s+definer\b|\b(?:create|alter|drop)\s+policy\b|\bdisable\s+row\s+level\s+security\b/i },
  { level: 2, scope: "kode", id: "aktiveringsflag", re: /^\s*(?:export\s+)?(?:const|let|var)\s+[A-Z][A-Z0-9_]{2,}\s*=\s*(?:true|false)\b|^\s*[A-Z][A-Z0-9_]{2,}\s*:\s*(?:true|false)\s*,?\s*$/ },
  { level: 2, scope: "kode", id: "skrivning-db", re: /\.from\(\s*["'`][\w.]+["'`]\s*\)\s*\.(?:insert|update|upsert|delete)\s*\(|\.rpc\(\s*["'`]|functions\.invoke\s*\(/ },
  { level: 2, scope: "kode", id: "sql-ændring", re: /\b(?:insert\s+into|update\s+\w+(?:\.\w+)?\s+set|alter\s+table|create\s+(?:or\s+replace\s+)?function)\b/i },
  // Kun VÆRTEN tjekkes mod den lille liste (Lærligs eget domæne, XML-namespaces, eksempeldomæner, lokale adresser),
  // så "https://evil.example.net/?lærlig.dk" og "https://lærlig.dk.evil.net" stadig tæller som eksterne.
  { level: 2, scope: "kode", id: "nyt-eksternt-endpoint", re: /https?:\/\/(?!(?:[\p{L}\p{N}-]+\.)*(?:lærlig\.dk|xn--lrlig-sra\.dk|w3\.org|example\.(?:com|org))(?=[:/"'`\s)>]|$)|(?:localhost|127\.0\.0\.1)(?=[:/"'`\s)>]|$))[\p{L}\p{N}.-]+\.[\p{L}]{2,}/iu },
]);

// Store binære/genererede filer scannes ikke for indhold (stierne gælder stadig).
const NO_CONTENT_SCAN = /\.(?:png|jpe?g|webp|gif|ico|woff2?|ttf|mp3|wav|ogg|pdf|zip)$|-snapshots\/|^package-lock\.json$/i;
// Dokumentation og test: kun signaler med scope "alle".
// (Stien bestemmer stadig niveauet: en ejet test eller et ejet dokument er mindst niveau 2 eller 3 i sig selv.)
const DOC_OR_TEST = /\.(?:md|txt)$|(?:^|\/)(?:tests?|__tests__|fixtures)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|^docs\/.*\.(?:md|json|txt|html)$/i;
// En ren kommentarlinje (//, #, --, /*, *, <!--) er ikke kørbar kode. Sidst i en linje fjernes " // …".
const COMMENT_LINE = /^\s*(?:\/\/|#|--|\/\*|\*|<!--)/;
const stripTrailingComment = (l) => l.replace(/\s\/\/\s.*$/, "");

export function classifyPath(path, codeownersRules, { isNew = false } = {}) {
  const p = String(path ?? "");
  if (!p || p.split("/").includes("..") || p.startsWith("/") || /[\0\r\n]/.test(p)) return { path: p, level: 3, reason: "ugyldig sti" };
  const l3 = hit(L3, p);
  if (l3) return { path: p, level: 3, reason: `niveau 3-sti ${l3}` };
  const owned = ownersFor(codeownersRules ?? [], p).length > 0;
  const ao = hit(AO, p);
  if (ao && !owned) {
    return isNew
      ? { path: p, level: 1, reason: `ny post i append-only ${ao}` }
      : { path: p, level: 2, reason: `ændring af eksisterende post i append-only ${ao}` };
  }
  const l2 = hit(L2, p);
  if (l2) return { path: p, level: 2, reason: `niveau 2-sti ${l2}` };
  if (owned) return { path: p, level: 2, reason: "ejet i CODEOWNERS" };
  const l1 = hit(L1, p);
  if (l1) return { path: p, level: 1, reason: `niveau 1-sti ${l1}` };
  return { path: p, level: 2, reason: "ukendt sti (fail closed)" };
}

// Parser en unified diff (git diff / gh pr diff). Begge sider af en omdøbning tæller som berørt, og en
// omdøbning er aldrig "ny". ---/+++ læses kun i filhovedet (før første @@), så en fjernet SQL-kommentar
// ("--- …") ikke kan forveksles med et filnavn.
export function parseUnifiedDiff(text) {
  const files = new Map();
  let current = null, inHeader = false;
  const touch = (p) => {
    if (!p || p === "/dev/null") return null;
    if (!files.has(p)) files.set(p, { path: p, added: [], isNew: false, deleted: false, renamed: false });
    return files.get(p);
  };
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (m) { const a = touch(m[1]); current = touch(m[2]); if (a && a !== current) { a.renamed = true; current.renamed = true; } inHeader = true; continue; }
    if (inHeader) {
      if (line.startsWith("@@")) { inHeader = false; continue; }
      if (/^new file mode/.test(line) && current && !current.renamed) current.isNew = true;
      else if (/^deleted file mode/.test(line) && current) current.deleted = true;
      else if (/^rename (?:from|to) /.test(line) && current) { touch(line.replace(/^rename (?:from|to) /, "")).renamed = true; current.renamed = true; current.isNew = false; }
      continue;
    }
    if (current && line.startsWith("+")) current.added.push(line.slice(1));
  }
  return [...files.values()];
}

export function classifyChange({ files, declared = 1, codeownersRules } = {}) {
  const list = Array.isArray(files) ? files : [];
  const findings = [];
  let level = 1;
  if (list.length === 0) { findings.push({ level: 2, reason: "ingen filer fundet (fail closed)" }); level = 2; }
  for (const f of list) {
    const path = typeof f === "string" ? f : f?.path;
    const isNew = typeof f === "object" && f?.isNew === true && f?.renamed !== true && f?.deleted !== true;
    const r = classifyPath(path, codeownersRules, { isNew });
    findings.push(r);
    level = Math.max(level, r.level);
    const added = typeof f === "object" && Array.isArray(f?.added) ? f.added : [];
    const p = String(path ?? "");
    if (NO_CONTENT_SCAN.test(p)) continue;
    const docOrTest = DOC_OR_TEST.test(p);
    for (const s of CONTENT_SIGNALS) {
      if (s.scope === "kode" && docOrTest) continue;
      const line = added.find((l) => {
        if (s.scope === "alle") return s.re.test(l);
        if (COMMENT_LINE.test(l)) return false;
        return s.re.test(stripTrailingComment(l));
      });
      if (line !== undefined) {
        findings.push({ path, level: s.level, reason: `indhold: ${s.id}` });
        level = Math.max(level, s.level);
      }
    }
  }
  const d = Number(declared);
  const declaredLevel = [1, 2, 3].includes(d) ? d : 3;
  if (declaredLevel > level) findings.push({ level: declaredLevel, reason: "agentens eget skøn er højere" });
  return { level: Math.max(level, declaredLevel), computed: level, declared: declaredLevel, findings };
}

// ---------------------------------------------------------------------------------------------
// Kommandolinje
// ---------------------------------------------------------------------------------------------
export function main(argv = process.argv.slice(2), io = { stdin: () => readFileSync(0, "utf8"), out: console.log, err: console.error }) {
  const args = { base: "origin/main", declared: "1", json: false, stdin: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--stdin") args.stdin = true;
    else if (a === "--base" || a === "--declared") args[a.slice(2)] = argv[++i];
    else if (a.startsWith("--base=")) args.base = a.slice(7);
    else if (a.startsWith("--declared=")) args.declared = a.slice(11);
    else { io.err(`risk-level: ukendt argument ${a}`); return 64; }
  }
  if (!["1", "2", "3"].includes(String(args.declared))) { io.err("risk-level: --declared skal være 1, 2 eller 3"); return 64; }
  if (!/^[A-Za-z0-9._/@~^-]+$/.test(String(args.base ?? ""))) { io.err("risk-level: ugyldig --base"); return 64; }
  const diff = args.stdin
    ? io.stdin()
    : execFileSync("git", ["diff", "--no-color", "-M", `${args.base}...HEAD`], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const result = classifyChange({ files: parseUnifiedDiff(diff), declared: Number(args.declared), codeownersRules: loadCodeowners() });
  if (args.json) io.out(JSON.stringify(result, null, 2));
  else {
    io.out(`risikoniveau: ${result.level} (beregnet ${result.computed}, agentens skøn ${result.declared})`);
    for (const f of result.findings.filter((x) => x.level === result.level)) io.out(`  ${f.level}  ${f.path ?? "-"}  ${f.reason}`);
  }
  return result.level;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
