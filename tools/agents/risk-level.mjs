// tools/agents/risk-level.mjs — deterministisk risikoniveau for en ændring (AURA T1).
// Politikken står i docs/operations/autonomy-levels.md. Kontrakten i tests/unit/agent-risk-level.test.mjs.
//
// Formål: en agent må ikke selv kunne klassificere en sikkerhedskritisk ændring som lav risiko. Niveauet
// beregnes derfor ud fra stier og tilføjede og fjernede linjer, og agentens eget skøn kan kun HÆVE niveauet,
// aldrig sænke det. Ukendte stier giver niveau 2, og alt, der er ejet i .github/CODEOWNERS, er mindst niveau 2.
// Alt, der ikke kan læses sikkert (en diff, der ikke kan parses, en fejl, en ændret klassifikator), giver 3.
//
//   1 = fuld automatik      (implementering, test, PR uden nyt GO)
//   2 = betinget automatik  (stærkere test og ejerens bekræftelse før merge)
//   3 = menneskelig godkendelse (ejeren beslutter; agenten forbereder kun)
//
// Værktøjet læser kun. Det kører aldrig git-skrivninger, netværkskald eller GitHub-kald.
//
// Brug:
//   node tools/agents/risk-level.mjs [--base origin/main] [--declared 1|2|3] [--json]
//   gh pr diff <n> | node tools/agents/risk-level.mjs --stdin
//
// EXITKODER: 11 = niveau 1, 12 = niveau 2, 13 = niveau 3, 64 = forkert brug. Alt andet (fx 1 ved et nedbrud i
// Node selv) er IKKE et niveau og skal behandles som 3. Kun exitkode 11 betyder niveau 1.
//
// Resultatet her er RÅDGIVENDE. Det bindende resultat kommer fra main's version af denne fil (merge-controlleren, AURA T4),
// fordi en branch kan ændre sin egen kopi. Derfor giver CLI'en 3, når filen her afviger fra base-versionen.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(SELF), "..", "..");
export const EXIT = Object.freeze({ 1: 11, 2: 12, 3: 13, usage: 64 });

// ---------------------------------------------------------------------------------------------
// CODEOWNERS: et forankret, gitignore-lignende mønster → RegExp. Kun den delmængde, filen bruger.
// fileOnly: mønsteret rammer kun en fil med præcis det navn, ikke en mappe af samme navn (bruges til niveau 1,
// så "x.html/evil.js" ikke er niveau 1 som "x.html").
// ---------------------------------------------------------------------------------------------
export function patternToRegExp(pattern, { fileOnly = false } = {}) {
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
  const suffix = dirOnly ? "/.*$" : fileOnly ? "$" : "(?:/.*)?$";
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
// Stier. Rækkefølgen er: niveau 3 → append-only → niveau 2 → ejet (2) → niveau 1 → ukendt (2).
// ---------------------------------------------------------------------------------------------
// Niveau 3: ejeren beslutter. Skal være en delmængde af CODEOWNERS (testet).
export const LEVEL3_PATHS = Object.freeze([
  "/.github/", "/docs/CLAUDE_WORKFLOW.md", "/docs/AI_GUIDELINES.md",
  "/docs/migration-workflow-policy.md", "/fix-tests.ps1", "/tools/agents/",
  // Agentinstruktioner i ALLE mapper: Claude Code og andre agenter læser dem også i undermapper (AURA-03).
  "/**/CLAUDE.md", "/**/CLAUDE.local.md", "/**/AGENTS.md", "/**/.claude/", "/**/.mcp.json",
  "/docs/operations/*runbook*", "/docs/operations/e2e-prod-*.md", "/docs/operations/agent-*.md",
  "/docs/operations/autonomy-levels.md",
  "/supabase/config.toml", "/tools/e2e/", "/tools/e2e-safety/", "/tools/backup/", "/tools/cloudflare-deploy.mjs",
  // Produktionsværktøjer: release-gates, deploy-bundlen og produktionskontroller (AURA-03, blind test #487).
  "/tools/edge/", "/tools/production/", "/production/", "/tools/cloudflare-build-static.mjs",
  "/tools/cloudflare-serve-check.mjs", "/tools/production-smoke.mjs", "/tools/publish-docs.mjs",
  "/worker/", "/wrangler.jsonc", "/js/supabase.js", "/supabaseClient.js", "/.gitignore", "/.env.example",
  "/tests/e2e-accounts.mjs", "/tests/e2e-admin.mjs", "/tests/e2e-guard.mjs", "/tests/e2e-slot.mjs",
  "/tests/test-credentials.mjs", "/tests/global-setup.ts", "/tests/helpers.ts",
  "/tests/isolated/isolation-guard.mjs", "/tests/isolated/egress-*", "/tests/isolated/negative-controls.sh",
  "/tests/isolated/cdn-*.mjs", "/tests/isolated/ci/", "/tests/isolated/seed/",
  // Det, som de påkrævede checks selv kører for at afgøre bestået/fejlet (AURA-03).
  "/tests/isolated/run-suite.mjs", "/tests/isolated/require-complete-run.mjs", "/tests/isolated/scope.mjs",
  "/tests/isolated/serve-build.mjs", "/tests/isolated/tripwire-proxy.mjs", "/tests/isolated/playwright.*",
  "/tests/isolated/schema/replay.mjs", "/tests/support/browser-launch-check.mjs", "/tests/support/mail-guard.ts",
  "/tests/support/teacher-id-restore.ts", "/tests/support/d237-guard-exception.mjs",
  "/tests/support/unit-timing.mjs", "/tests/support/timing-reporter.mjs", "/tools/ci/run-triage.mjs",
  "/tests/run-unit-ci.mjs", "/tests/unit-ci-exclusions.mjs", "/playwright.config.ts", "/node_modules/",
  "/tests/unit/ci-*.test.mjs", "/tests/unit/claude-settings-guard.test.mjs", "/tests/unit/credential-hygiene.test.mjs",
  "/tests/unit/e2e-*.test.mjs", "/tests/unit/isolated-*.test.mjs", "/tests/unit/migration-workflow-policy.test.mjs",
  "/tests/unit/agent-*.test.mjs", "/tests/unit/codeowners.test.mjs", "/tests/unit/password-help-*.test.mjs",
  "/tests/unit/password-reset-form-no-live-call.test.mjs", "/tests/unit/cloudflare-*.test.mjs",
  "/tests/unit/production-*.test.mjs", "/tests/unit/krypter-backup.test.mjs",
  "/tests/unit/fix-tests-no-git-mutation.test.mjs", "/tests/unit/repo-walk-build-output-isolation.test.mjs",
  "/tests/unit/review-answer-authorization.test.mjs",
  "/tests/unit/profiles-self-update-columns-guard.test.mjs", "/tests/unit/d237-guard-exception.test.mjs",
]);

// Niveau 2 uden ejerskab: belønning, bedømmelse, login, elevdata, aktiveringsflag, privatliv og betalte kald.
export const LEVEL2_PATHS = Object.freeze([
  "/app.js", "/js/progression.js", "/js/answer-submission.js", "/js/quiz-cooldown.js", "/js/flags.js",
  "/js/login.js", "/login.html", "/js/reset-password.js", "/reset-password.html",
  "/js/admin.js", "/admin.html", "/js/teacher.js", "/teacher.html", "/js/student-detail.js",
  "/student-detail.html", "/js/storage.js",
  "/js/consent.js", "/js/analytics.js", "/js/analytics-consent.js", "/js/sentry.js",
  "/tools/avatar-batch/", "/tools/read-aloud/", "/tools/replay-harness/", "/tools/questions/",
  "/tests/isolated/schema/", "/tests/support/", "/tools/ci/", "/docs/operations/*.md", "/docs/operations/*.json",
  "/**/*.sql",
  // Afhængigheder overalt, også i underpakker (AURA-03, blind test #541): en ny pakke er forsyningskæde.
  "/**/package.json", "/**/package-lock.json", "/**/pnpm-lock.yaml", "/**/yarn.lock", "/**/deno.json",
  "/**/deno.lock", "/**/.npmrc",
  // Pakkehåndtering og testrunnere i alle mapper: de kan køre kode under installation eller ændre, hvad test
  // kører (AURA-04, red-team F8).
  "/**/pnpm-workspace.yaml", "/**/.pnpmfile.cjs", "/**/.yarnrc", "/**/.yarnrc.yml", "/**/bunfig.toml",
  "/**/vitest.config.*", "/**/vite.config.*", "/**/jest.config.*", "/**/playwright.config.*", "/**/babel.config.*",
  // Sikkerhedstest uden ejer: de beviser RLS, nøgler og rettigheder (AURA-04, red-team F1).
  "/tests/unit/*lockdown*", "/tests/unit/*answer-key*", "/tests/unit/*read-scope*", "/tests/unit/*execute-scope*",
  "/tests/unit/*-guard*", "/tests/unit/*authorization*", "/tests/unit/*ownership*", "/tests/unit/revoke-*",
  "/tests/unit/reward-integrity-*", "/tests/unit/*rls*", "/tests/unit/*security*", "/tests/unit/*grant*",
  "/tests/unit/*-migration-run.test.mjs",
  // Kanoniske dokumenter, der sjældent ændres: arkitektur og vision ændres ikke uden ejeren (AURA-04, red-team F9).
  // Status-dokumenterne (ROADMAP, AVATAR_SYSTEM, project-state) og D-registret opdateres i næsten hver PR; der
  // giver kun en SLETNING niveau 2 (classifyChange).
  "/docs/ARCHITECTURE.md", "/docs/PROJECT_VISION.md",
]);

// Append-only: en NY Markdown-fil her er niveau 1; alt andet (ændret, omdøbt, slettet, anden filtype) er 2.
export const APPEND_ONLY_PATHS = Object.freeze(["/docs/operations/production-actions/"]);
// Beslutninger og status-dokumenter: en sletning eller omdøbning er mindst niveau 2 (red-team F9).
const DECISION_RECORD = /^docs\/(?:decisions\/|project-state\.md$|ROADMAP\.md$|AVATAR_SYSTEM\.md$)/;
// Avatar-test: deres forventede antal (garderobe, varianter) ændres i næsten hver avatar-PR. For dem gælder kun
// reglen om færre asserts, ikke reglen om en ændret assert.
const AVATAR_TEST = /^tests\/(?:unit\/)?(?:avatar|northstar)[-_]/i;

// Niveau 1: eksplicit tilladt. Alt andet, der ikke er nævnt, er niveau 2.
export const LEVEL1_PATHS = Object.freeze([
  "/*.html", "/style.css", "/css/", "/assets/", "/js/", "/docs/", "/data/",
  "/tests/*.spec.ts", "/tests/*-snapshots/", "/tests/fixtures/", "/tests/c2-golden/", "/tests/unit/",
  "/tests/isolated/", "/tests/offline-specs.mjs",
  "/laerligverse/", "/adventure-engine/", "/packages/", "/tools/avatar/", "/tools/question-cli/",
  "/tools/question-quality/", "/tools/question-mix-sim/", "/tools/true-false/", "/tools/match-pairs/",
  "/tools/stimulus/", "/tools/laerligverse/", "/tools/decisions/",
]);

const compile = (list, opts) => list.map((p) => ({ pattern: p, re: patternToRegExp(p, opts) }));
const L3 = compile(LEVEL3_PATHS), L2 = compile(LEVEL2_PATHS), AO = compile(APPEND_ONLY_PATHS);
const L1 = compile(LEVEL1_PATHS, { fileOnly: true });
const hit = (list, path) => list.find((x) => x.re.test(path))?.pattern ?? null;

// ---------------------------------------------------------------------------------------------
// Indhold. Signalerne kan kun hæve niveauet. De er en hjælp, ikke en sikkerhedsgrænse: tekst kan altid skrives,
// så et mønster ikke rammer (docs/operations/autonomy-levels.md, "Grænser").
//   scope "alle"      = alle filer, også test, Markdown og kommentarer (en rigtig hemmelighed er altid alvorlig)
//   scope "kode"      = kørbar kode uden for tests/ og docs/; rene kommentarer tæller ikke
//   scope "prod-spec" = specs og hjælpere under tests/, der kører mod PRODUKTIONEN (ikke unit og ikke isoleret)
//   scope "test"      = alle filer under tests/
// ---------------------------------------------------------------------------------------------
const ALLOWED_HOST = String.raw`(?:(?:[\p{L}\p{N}-]+\.)*(?:lærlig\.dk|xn--lrlig-sra\.dk|w3\.org|example\.(?:com|org))|localhost|127\.0\.0\.1)(?=[:/"'\x60\s)>]|$)`;
export const CONTENT_SIGNALS = Object.freeze([
  { level: 3, scope: "alle", id: "secret-literal", re: /sb_secret_[A-Za-z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|\bghp_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|\bghs_[A-Za-z0-9]{30,}/ },
  { level: 3, scope: "alle", id: "guard-omgåelse", re: /--no-verify\b|dangerouslyDisableSandbox|\[skip ci\]|\[ci skip\]|\[no ci\]|\[skip actions\]|\[actions skip\]|gh pr merge[^\n]*--admin\b/i },
  { level: 3, scope: "kode", id: "secret-nøgle", re: /service[_-]?role|sb_secret_|SUPABASE_SERVICE|SUPABASE_SECRET/i },
  { level: 3, scope: "kode", id: "github-secret", re: /\$\{\{\s*secrets\./ },
  { level: 3, scope: "kode", id: "auth-admin", re: /auth\.admin\b|\bauth\.users\b/ },
  { level: 3, scope: "kode", id: "destruktiv-sql", re: /\b(?:drop\s+(?:table|schema|function|policy|trigger|column|view|index)|truncate\b|delete\s+from|alter\s+table\b[^;]*\bdrop\b)/i },
  { level: 3, scope: "kode", id: "rettigheder-sql", re: /\b(?:grant|revoke)\b[^;]*\b(?:on|to|from)\b|\bsecurity\s+definer\b|\b(?:create|alter|drop)\s+policy\b|\bdisable\s+row\s+level\s+security\b/i },
  // Playwright-specs uden for den isolerede stak kører mod PRODUKTIONEN (tests/helpers.ts → PROD). En spec, der
  // bruger admin-klienten eller skriver i databasen, ændrer produktionsdata (AURA-03, blind test #316).
  { level: 3, scope: "prod-spec", id: "prod-admin-klient", re: /\b(?:adminClient|serviceClient|createAdminClient|getAdminClient)\b|service[_-]?role|SUPABASE_SERVICE|auth\.admin\b/i },
  { level: 2, scope: "prod-spec", id: "prod-skrivning", re: /\.(?:insert|update|upsert|delete)\s*\(|\[\s*["'`](?:insert|update|upsert|delete|rpc)["'`]\s*\]|\.rpc\s*\(|functions\.invoke\s*\(|\/(?:rest|functions|auth|storage)\/v1\// },
  { level: 2, scope: "test", id: "test-sprunget-over", re: /\b(?:test|it|describe)\s*\.\s*(?:skip|only|fixme|fail|todo)\b|\bxit\s*\(|\bxdescribe\s*\(|[{,]\s*(?:skip|todo|only)\s*:|\bt\.(?:skip|todo)\s*\(/ },
  // Unit-test kører på hver PR, før review: et kald mod Supabase' API'er rammer en rigtig tjeneste (red-team F5).
  { level: 2, scope: "test", id: "test-mod-api", re: /\/(?:rest|functions|auth|storage)\/v1\/|\.supabase\.co\b/ },
  { level: 2, scope: "kode", id: "aktiveringsflag", re: /\b[A-Z][A-Z0-9_]{2,}["'`]?\s*(?:=|:)\s*(?:true|false|!0|!1)\b/ },
  { level: 2, scope: "kode", id: "betalt-kald", re: /\bnew\s+(?:OpenAI|Anthropic)\s*\(|\bopenai\.(?:chat|responses|images|audio|embeddings)\b|\.messages\.create\s*\(|["'`](?:openai|@anthropic-ai\/sdk)["'`]/ },
  { level: 2, scope: "kode", id: "skrivning-db", re: /\.from\([^)]*\)\s*(?:\.\s*|\[\s*["'`])(?:insert|update|upsert|delete)\b|^\s*\.(?:insert|update|upsert|delete)\s*\(|\[\s*["'`](?:insert|update|upsert|delete)["'`]\s*\]|\.rpc\s*\(|functions\.invoke\s*\(|\/(?:rest|functions|auth|storage)\/v1\/|\.storage\s*\.\s*from\([^)]*\)\s*\.\s*(?:upload|update|remove|move|copy)\b|^\s*\.(?:upload|remove|move)\s*\(|\bauth\.(?:updateUser|signUp|resetPasswordForEmail)\b/ },
  { level: 2, scope: "kode", id: "sql-ændring", re: /\b(?:insert\s+into|update\s+\w+(?:\.\w+)?\s+set|alter\s+table|create\s+(?:or\s+replace\s+)?function)\b/i },
  { level: 2, scope: "kode", id: "dynamisk-kode", re: /\beval\s*\(|\bnew\s+Function\s*\(|\bimport\s*\(\s*(?!["'`])|\bset(?:Timeout|Interval)\s*\(\s*["'`]|document\.write\s*\(|createElement\(\s*["'`]script["'`]|<script\b[^>]*\bsrc\s*=/i },
  // Rå HTML fra en streng er den typiske vej til stored XSS med elevtekst (red-team K02).
  { level: 2, scope: "kode", id: "rå-html", re: /\.(?:innerHTML|outerHTML)\s*\+?=|\binsertAdjacentHTML\s*\(|\bdangerouslySetInnerHTML\b/ },
  { level: 2, scope: "kode", id: "ip-endpoint", re: /\b(?:https?|wss?|ftp):\/\/(?!127\.0\.0\.1\b)\d{1,3}(?:\.\d{1,3}){3}\b/i },
  { level: 2, scope: "kode", id: "url-med-brugerinfo", re: /\b(?:https?|wss?|ftp):\/\/[^\s"'`/]*@/i },
  // Kun VÆRTEN tjekkes mod den lille liste (Lærligs eget domæne, XML-namespaces, eksempeldomæner, lokale adresser),
  // så "https://evil.example.net/?lærlig.dk" og "https://lærlig.dk.evil.net" stadig tæller som eksterne. Også
  // wss://, protokolrelative //vært og IP-adresser.
  { level: 2, scope: "kode", id: "nyt-eksternt-endpoint", re: new RegExp(String.raw`(?:\b(?:https?|wss?|ftp):)?\/\/(?!${ALLOWED_HOST})[\p{L}\p{N}.-]+\.[\p{L}\p{N}]{2,}`, "iu") },
]);

// Binære filer og genererede snapshots scannes ikke for indhold (stierne gælder stadig).
const NO_CONTENT_SCAN = /\.(?:png|jpe?g|webp|gif|ico|woff2?|ttf|mp3|wav|ogg|pdf|zip)$|^tests\/(?:.*\/)?[^/]*-snapshots\/|(?:^|\/)package-lock\.json$/i;
// Binære filtyper, der er forventelige. En binær fil med en anden endelse (fx js/x.js) er mindst niveau 2.
const EXPECTED_BINARY = /\.(?:png|jpe?g|webp|gif|ico|woff2?|ttf|otf|mp3|wav|ogg|pdf|zip|avif|svgz)$/i;
// Dokumentation, test og data: kun signaler med scope "alle" (og "test"/"prod-spec" for tests/). Forankret, så
// js/fixtures/x.js eller js/x.spec.js stadig er kode. JSON under en fixtures/-mappe er data, ikke kørbar kode.
const DOC_OR_TEST = /^(?:docs|tests)\/|\.(?:md|txt)$|(?:^|\/)fixtures\/(?:[^/]+\/)*[^/]+\.json$/i;
// Specs og hjælpere, der kører mod produktionen: alt under tests/ undtagen unit-test og den isolerede stak.
const PROD_SPEC = /^tests\/(?!unit\/|isolated\/)(?:[^/]+\/)*[^/]+\.(?:spec\.[cm]?[jt]s|[cm]?ts|[cm]?js)$/i;
// Asserts og test-erklæringer: en ændring, der fjerner flere, end den tilføjer, svækker testen.
const ASSERT_RE = /\bassert(?:\.\w+)*\s*\(|\bexpect(?:\.\w+)*\s*\(|\b(?:test|it)\s*\(/g;
// En testfil, også uden for tests/ (fx adventure-engine/**/x.test.ts og e2e-specs).
const TEST_FILE = /^tests\/|(?:^|\/)(?:e2e|__tests__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/i;
// Agentinstruktioner i alle mapper og med alle store/små bogstaver, også for andre agenter (red-team F14).
const AGENT_FILE = /(?:^|\/)(?:claude(?:\.local)?\.md|agents\.md|gemini\.md|\.cursorrules|\.windsurfrules|\.clinerules|copilot-instructions\.md|\.mcp\.json)$|(?:^|\/)\.(?:claude|cursor|windsurf|clinerules|gemini|codex)\//i;
// codeownersRules er én regelliste eller en liste af regellister (base og branch). En sti er ejet, hvis den er ejet
// i MINDST én af dem: en branch kan ikke fjerne base-versionens ejerskab (red-team F15).
const isOwned = (rules, p) => {
  const sets = Array.isArray(rules?.[0]) ? rules : [rules ?? []];
  return sets.some((r) => ownersFor(r, p).length > 0);
};

// Den kørbare del af en linje: blokkommentarer på linjen fjernes, og en hel kommentarlinje bliver tom.
// Det er bevidst groft: en linje, der KAN være kode, scannes (falske fund hæver kun niveauet).
export function codeOf(line, path) {
  let l = String(line);
  // "/*" og "*/" inde i strenge må ikke skjule koden imellem (red-team G06): fjernes kun på linjer uden citattegn.
  if (!/["'`]/.test(l)) l = l.replace(/\/\*.*?\*\//g, " ");
  l = l.replace(/<!--.*?-->/g, " ");
  // "//" er kun en kommentar i JS/TS, ikke i HTML eller CSS (red-team G05).
  if (/\.[cm]?[jt]sx?$/i.test(path) && /^\s*\/\//.test(l)) return "";
  if (/\.sql$/i.test(path) && /^\s*--/.test(l)) return "";
  if (/\.(?:sh|ya?ml|toml|py|ps1|rb|ini|conf)$/i.test(path) && /^\s*#/.test(l)) return "";
  return l;
}

export function classifyPath(path, codeownersRules, { isNew = false } = {}) {
  const p = String(path ?? "");
  if (!p || p.split("/").includes("..") || p.split("/").includes(".") || p.split("/").includes("") || p.startsWith("/") || /[\0\r\n\\]/.test(p)) {
    return { path: p, level: 3, reason: "ugyldig sti" };
  }
  if (AGENT_FILE.test(p)) return { path: p, level: 3, reason: "agentinstruktion" };
  const l3 = hit(L3, p);
  if (l3) return { path: p, level: 3, reason: `niveau 3-sti ${l3}` };
  const owned = isOwned(codeownersRules, p);
  const ao = hit(AO, p);
  if (ao && !owned) {
    return isNew && /\.md$/i.test(p)
      ? { path: p, level: 1, reason: `ny post i append-only ${ao}` }
      : { path: p, level: 2, reason: `ændring eller anden filtype i append-only ${ao}` };
  }
  const l2 = hit(L2, p);
  if (l2) return { path: p, level: 2, reason: `niveau 2-sti ${l2}` };
  if (owned) return { path: p, level: 2, reason: "ejet i CODEOWNERS" };
  const l1 = hit(L1, p);
  if (l1) return { path: p, level: 1, reason: `niveau 1-sti ${l1}` };
  return { path: p, level: 2, reason: "ukendt sti (fail closed)" };
}

// ---------------------------------------------------------------------------------------------
// Diff-parser (git diff / gh pr diff). Den er STRENG: hver linje skal høre til et filhoved, en hunk med det
// antal linjer, hunk-hovedet lover, eller en binær patch. Alt andet bliver en "anomali", som giver niveau 3.
// Citerede stier (git's core.quotePath) afkodes. Begge sider af en omdøbning eller kopi tæller som berørt.
// ---------------------------------------------------------------------------------------------
const C_ESCAPES = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '"': 34, "\\": 92 };
// Læser en git-citeret streng fra s[i] === '"'. Returnerer { value, end } eller null.
function readQuoted(s, i) {
  if (s[i] !== '"') return null;
  const bytes = [];
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (c === '"') return { value: Buffer.from(bytes).toString("utf8"), end: j + 1 };
    if (c === "\\") {
      const n = s[j + 1];
      if (/[0-7]/.test(n ?? "")) {
        const oct = /^[0-7]{1,3}/.exec(s.slice(j + 1))[0];
        bytes.push(parseInt(oct, 8)); j += oct.length; continue;
      }
      if (n in C_ESCAPES) { bytes.push(C_ESCAPES[n]); j += 1; continue; }
      return null;
    }
    bytes.push(...Buffer.from(c, "utf8"));
  }
  return null;
}
export function unquotePath(s) {
  const t = String(s ?? "");
  if (!t.startsWith('"')) return t;
  const q = readQuoted(t, 0);
  return q && q.end === t.length ? q.value : null;
}
// "a/X b/Y" med eller uden citater. Uciterede stier med mellemrum er kun entydige, når X === Y.
function parseGitHeader(rest) {
  const tokens = [];
  let i = 0;
  if (rest.startsWith('"')) {
    const q = readQuoted(rest, 0);
    if (!q || rest[q.end] !== " ") return null;
    tokens.push(q.value); i = q.end + 1;
    const second = rest.slice(i);
    const q2 = second.startsWith('"') ? readQuoted(second, 0) : null;
    if (second.startsWith('"')) { if (!q2 || q2.end !== second.length) return null; tokens.push(q2.value); }
    else tokens.push(second);
  } else {
    const qAt = rest.indexOf(' "');
    if (qAt > 0 && rest.endsWith('"')) {
      const q2 = readQuoted(rest, qAt + 1);
      if (!q2 || q2.end !== rest.length) return null;
      tokens.push(rest.slice(0, qAt), q2.value);
    } else {
      // Ens stier: "a/P b/P" har længden 2|P| + 5, så "a/P" er de første |P| + 2 tegn.
      const len = (rest.length - 5) / 2;
      if (Number.isInteger(len) && len > 0) {
        const a = rest.slice(0, len + 2), b = rest.slice(len + 3);
        if (rest[len + 2] === " " && a.startsWith("a/") && b.startsWith("b/") && a.slice(2) === b.slice(2)) tokens.push(a, b);
      }
      if (tokens.length === 0) {
        const m = /^(a\/\S+) (b\/\S+)$/.exec(rest);
        if (!m) return { ambiguous: true };
        tokens.push(m[1], m[2]);
      }
    }
  }
  if (!tokens[0].startsWith("a/") || !tokens[1].startsWith("b/")) return null;
  return { a: tokens[0].slice(2), b: tokens[1].slice(2) };
}

export function parseUnifiedDiff(text) {
  const files = new Map();
  const anomalies = [];
  const touch = (p) => {
    if (p == null || p === "/dev/null") return null;
    if (!files.has(p)) files.set(p, { path: p, added: [], removed: [], isNew: false, deleted: false, renamed: false, binary: false, special: false });
    return files.get(p);
  };
  const anomaly = (n, why) => { if (anomalies.length < 20) anomalies.push(`linje ${n}: ${why}`); };
  const headerPath = (s, prefix) => {
    const raw = s.replace(/\t.*$/, "");
    const v = raw.startsWith('"') ? unquotePath(raw) : raw;
    if (v === "/dev/null") return v;
    return v != null && v.startsWith(prefix) ? v.slice(prefix.length) : null;
  };
  let current = null, state = "start", oldLeft = 0, newLeft = 0;
  // Et tvetydigt filhoved får sin rigtige sti fra ---/+++ eller rename-linjerne; flagene følger med.
  const adopt = (t) => {
    for (const k of ["isNew", "deleted", "special", "binary"]) t[k] = t[k] || current[k];
    if (t.renamed) t.isNew = false;
    files.delete(current.path);
    current = t;
  };
  const lines = String(text ?? "").split("\n").map((l) => l.replace(/\r$/, ""));
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    if (state === "hunk") {
      const c = line[0];
      if (line === "" || c === " ") { oldLeft--; newLeft--; }
      else if (c === "-") { oldLeft--; current.removed.push(line.slice(1)); }
      else if (c === "+") { newLeft--; current.added.push(line.slice(1)); }
      else if (c === "\\") { /* \ No newline at end of file */ }
      else { anomaly(n + 1, "uventet linje i hunk"); state = "between"; }
      if (oldLeft < 0 || newLeft < 0) { anomaly(n + 1, "hunk længere end hovedet lover"); state = "between"; }
      else if (oldLeft === 0 && newLeft === 0) state = "between";
      continue;
    }
    if (line.startsWith("diff --git ")) {
      const h = parseGitHeader(line.slice("diff --git ".length));
      state = "header";
      if (!h) { anomaly(n + 1, "filhoved kan ikke læses"); current = touch(`<ukendt fil ${n + 1}>`); current.anomaly = true; continue; }
      if (h.ambiguous) { current = touch(`<tvetydigt filhoved ${n + 1}>`); current.pendingAmbiguous = true; continue; }
      const a = touch(h.a); current = touch(h.b);
      if (a && a !== current) { a.renamed = true; current.renamed = true; }
      continue;
    }
    if (line.startsWith("diff ")) { anomaly(n + 1, "ukendt diff-format (fx diff --cc)"); state = "between"; current = null; continue; }
    if (state === "header" || (state === "between" && current && line.startsWith("@@"))) {
      const hm = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
      if (line.startsWith("@@")) {
        if (!hm || !current) { anomaly(n + 1, "ugyldigt hunk-hoved"); state = "between"; continue; }
        oldLeft = hm[1] === undefined ? 1 : Number(hm[1]);
        newLeft = hm[2] === undefined ? 1 : Number(hm[2]);
        state = oldLeft === 0 && newLeft === 0 ? "between" : "hunk";
        continue;
      }
      if (state !== "header") { anomaly(n + 1, "uventet linje"); continue; }
      if (line === "") continue;
      let m;
      if ((m = /^(new file mode|deleted file mode|old mode|new mode) (\d{6})$/.exec(line))) {
        if (m[2] === "120000" || m[2] === "160000") current.special = true;
        if (m[1] === "new file mode" && !current.renamed) current.isNew = true;
        if (m[1] === "deleted file mode") current.deleted = true;
      } else if ((m = /^index [0-9a-f]+\.\.[0-9a-f]+(?: (\d{6}))?$/.exec(line))) {
        if (m[1] === "120000" || m[1] === "160000") current.special = true;
      } else if ((m = /^(rename|copy) (from|to) (.+)$/.exec(line))) {
        const p = unquotePath(m[3]);
        if (p == null) { anomaly(n + 1, "sti kan ikke læses"); continue; }
        const t = touch(p); t.renamed = true; t.isNew = false;
        if (current.pendingAmbiguous) adopt(t);
        else { current.renamed = true; current.isNew = false; }
        if (m[2] === "to") current = t;
      } else if (/^(?:similarity|dissimilarity) index \d+%$/.test(line)) {
        // ok
      } else if (line.startsWith("--- ") || line.startsWith("+++ ")) {
        const p = headerPath(line.slice(4), line.startsWith("---") ? "a/" : "b/");
        if (p == null) { anomaly(n + 1, "sti i ---/+++ kan ikke læses"); continue; }
        if (p !== "/dev/null") {
          const t = touch(p);
          if (current.pendingAmbiguous) adopt(t);
          else if (t !== current) { t.renamed = true; current.renamed = true; t.isNew = false; current.isNew = false; }
          if (line.startsWith("+++ ")) current = t;
        }
      } else if (/^Binary files .* differ$/.test(line)) {
        current.binary = true;
      } else if (line === "GIT binary patch") {
        current.binary = true; state = "binary";
      } else {
        anomaly(n + 1, "ukendt linje i filhovedet");
      }
      continue;
    }
    if (state === "binary") {
      if (line === "" || /^(?:literal|delta) \d+$/.test(line) || /^[A-Za-z][0-9A-Za-z!#$%&()*+;<=>?@^_`{|}~-]*$/.test(line)) continue;
      anomaly(n + 1, "ukendt linje i binær patch"); state = "between"; continue;
    }
    if (line === "" || (state === "between" && line.startsWith("\\ "))) continue; // "\ No newline at end of file"
    anomaly(n + 1, state === "start" ? "tekst før første filhoved" : "linje uden for filhoved og hunk");
  }
  if (state === "hunk" && (oldLeft > 0 || newLeft > 0)) anomaly(lines.length, "diffen slutter midt i en hunk (ufuldstændig)");
  for (const f of files.values()) if (f.pendingAmbiguous) { f.anomaly = true; anomalies.push(`${f.path}: stier kan ikke afgøres`); }
  const out = [...files.values()].filter((f) => !f.pendingAmbiguous);
  if (anomalies.length) out.push({ path: "<diff>", anomaly: anomalies.join("; "), added: [], removed: [] });
  return out;
}

const countAsserts = (lines) => lines.reduce((n, l) => n + ((codeOf(l, "x.js").match(ASSERT_RE) ?? []).length), 0);

export function classifyChange({ files, declared = 1, codeownersRules, extraFindings = [] } = {}) {
  const list = Array.isArray(files) ? files : [];
  const findings = [];
  let level = 1;
  const raise = (f) => { findings.push(f); level = Math.max(level, f.level); };
  if (list.length === 0) raise({ level: 3, reason: "ingen filer fundet (fail closed)" });
  for (const f of list) {
    if (typeof f === "object" && f?.anomaly) { raise({ path: f.path, level: 3, reason: `diffen kan ikke læses sikkert: ${f.anomaly}` }); continue; }
    const path = typeof f === "string" ? f : f?.path;
    const isNew = typeof f === "object" && f?.isNew === true && f?.renamed !== true && f?.deleted !== true;
    const r = classifyPath(path, codeownersRules, { isNew });
    raise(r);
    if (typeof f !== "object" || f === null) continue;
    const p = String(path ?? "");
    if (f.special) raise({ path, level: 3, reason: "symlink eller submodule" });
    if (f.binary && !EXPECTED_BINARY.test(p)) raise({ path, level: 2, reason: "binær fil med uventet filtype" });
    if (f.deleted && !/^(?:docs|assets)\//.test(p)) raise({ path, level: 2, reason: "sletning af en fil uden for docs/ og assets/" });
    const added = Array.isArray(f.added) ? f.added : [];
    const removed = Array.isArray(f.removed) ? f.removed : [];
    if (TEST_FILE.test(p) && removed.length > 0 && countAsserts(removed) > countAsserts(added)) {
      raise({ path, level: 2, reason: "færre asserts eller test end før (en test svækkes)" });
    }
    // En ændret assert kan være en løsnet assert: en fjernet assert-linje, der ikke står uændret blandt de
    // tilføjede (red-team F3).
    // Eksisterende fixtures i tests/fixtures/ er paritets- og facitdata: en ændring kan få en test til at bestå forkert
    // (red-team T11). En NY fixture er niveau 1.
    if (p.startsWith("tests/fixtures/") && !isNew) raise({ path, level: 2, reason: "eksisterende fixture ændret" });
    if (DECISION_RECORD.test(p) && (f.deleted || f.renamed)) raise({ path, level: 2, reason: "beslutning eller status-dokument slettet eller omdøbt" });
    if (TEST_FILE.test(p) && !AVATAR_TEST.test(p) && removed.some((l) => countAsserts([l]) > 0 && !added.includes(l))) {
      raise({ path, level: 2, reason: "en assert er ændret eller fjernet (kan svække testen)" });
    }
    // En omdøbt eller flyttet testfil kan være taget ud af CI (red-team F2).
    if (f.renamed && TEST_FILE.test(p)) raise({ path, level: 2, reason: "testfil omdøbt eller flyttet" });
    if (NO_CONTENT_SCAN.test(p)) continue;
    const docOrTest = DOC_OR_TEST.test(p);
    for (const s of CONTENT_SIGNALS) {
      if (s.scope === "kode" && docOrTest) continue;
      if (s.scope === "prod-spec" && !PROD_SPEC.test(p)) continue;
      if (s.scope === "test" && !p.startsWith("tests/")) continue;
      const hitLine = added.some((l) => (s.scope === "alle" ? s.re.test(l) : s.re.test(codeOf(l, p))));
      if (hitLine) raise({ path, level: s.level, reason: `indhold: ${s.id}` });
    }
  }
  for (const x of Array.isArray(extraFindings) ? extraFindings : []) raise({ level: [1, 2, 3].includes(x?.level) ? x.level : 3, reason: String(x?.reason ?? "ukendt fund") });
  const d = Number(declared);
  const declaredLevel = [1, 2, 3].includes(d) ? d : 3;
  if (declaredLevel > level) findings.push({ level: declaredLevel, reason: "agentens eget skøn er højere" });
  return { level: Math.max(level, declaredLevel), computed: level, declared: declaredLevel, findings };
}

// ---------------------------------------------------------------------------------------------
// Kommandolinje. Enhver fejl giver 3 (exitkode 13).
// ---------------------------------------------------------------------------------------------
const defaultGit = (args) => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const DEFAULT_IO = { stdin: () => readFileSync(0, "utf8"), out: console.log, err: console.error, git: defaultGit, self: () => readFileSync(SELF, "utf8") };

// git diff --name-status -z: "M\0sti\0" eller "R100\0gammel\0ny\0".
export function parseNameStatusZ(text) {
  const parts = String(text ?? "").split("\0");
  const paths = [];
  for (let i = 0; i < parts.length; i++) {
    const st = parts[i];
    if (!st) continue;
    if (/^[RC]\d*$/.test(st)) { paths.push(parts[i + 1], parts[i + 2]); i += 2; }
    else if (/^[AMDTUXB]$/.test(st)) { paths.push(parts[i + 1]); i += 1; }
    else throw new Error(`ukendt name-status: ${st}`);
  }
  if (paths.some((p) => typeof p !== "string" || p === "")) throw new Error("ufuldstændig name-status");
  return paths;
}

function run(argv, io) {
  const args = { base: "origin/main", declared: "1", json: false, stdin: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--stdin") args.stdin = true;
    else if (a === "--base" || a === "--declared") args[a.slice(2)] = argv[++i];
    else if (a.startsWith("--base=")) args.base = a.slice(7);
    else if (a.startsWith("--declared=")) args.declared = a.slice(11);
    else { io.err(`risk-level: ukendt argument ${a}`); return EXIT.usage; }
  }
  if (!["1", "2", "3"].includes(String(args.declared))) { io.err("risk-level: --declared skal være 1, 2 eller 3"); return EXIT.usage; }
  if (!/^[A-Za-z0-9._/@~^][A-Za-z0-9._/@~^-]*$/.test(String(args.base ?? ""))) { io.err("risk-level: ugyldig --base"); return EXIT.usage; }

  const extra = [];
  let rules = loadCodeowners();
  let files;
  if (args.stdin) {
    files = parseUnifiedDiff(io.stdin());
    // Uden git kan diffen hverken krydstjekkes mod name-status eller commit-beskederne læses (red-team P09). Stdin
    // giver derfor aldrig niveau 1.
    extra.push({ level: 2, reason: "stdin: diffen kan ikke krydstjekkes, så stdin giver aldrig niveau 1" });
  } else {
    const range = `${args.base}...HEAD`;
    const diff = io.git(["-c", "core.quotePath=false", "diff", "--no-color", "--no-ext-diff", "--no-textconv", "--src-prefix=a/", "--dst-prefix=b/", "-M", range]);
    files = parseUnifiedDiff(diff);
    // Stierne krydstjekkes med git's egen liste: en fil, parseren ikke så, er en anomali.
    const seen = new Set(files.map((f) => f.path));
    const missing = parseNameStatusZ(io.git(["-c", "core.quotePath=false", "diff", "--name-status", "-z", "--no-ext-diff", "-M", range])).filter((p) => !seen.has(p));
    if (missing.length) extra.push({ level: 3, reason: `diffen mangler filer, som git kender: ${missing.slice(0, 5).join(", ")}` });
    // Reglerne fra base tæller også: en branch kan ikke fjerne sit eget ejerskab.
    let baseOwners = null;
    try { baseOwners = io.git(["show", `${args.base}:.github/CODEOWNERS`]); } catch { baseOwners = null; }
    if (baseOwners === null) extra.push({ level: 3, reason: "CODEOWNERS findes ikke på base: reglerne kan ikke sammenlignes" });
    else rules = [parseCodeowners(baseOwners), rules];
    // Klassifikatoren selv skal være base-versionen. Ellers bedømmer branchen sig selv.
    let baseSelf = null;
    try { baseSelf = io.git(["show", `${args.base}:tools/agents/risk-level.mjs`]); } catch { baseSelf = null; }
    if (baseSelf === null || baseSelf.replace(/\r\n/g, "\n") !== io.self().replace(/\r\n/g, "\n")) {
      extra.push({ level: 3, reason: "klassifikatoren afviger fra base-versionen (eller findes ikke på base): resultatet kan ikke stoles på" });
    }
    // Commit-beskeder: [skip ci] o.l. i en besked slår CI fra.
    const msgs = io.git(["log", "--format=%B", `${args.base}..HEAD`]);
    const guard = CONTENT_SIGNALS.find((s) => s.id === "guard-omgåelse");
    if (guard.re.test(msgs)) extra.push({ level: 3, reason: "commit-besked: guard-omgåelse" });
  }
  const result = classifyChange({ files, declared: Number(args.declared), codeownersRules: rules, extraFindings: extra });
  if (args.json) io.out(JSON.stringify(result, null, 2));
  else {
    io.out(`risikoniveau: ${result.level} (beregnet ${result.computed}, agentens skøn ${result.declared})`);
    for (const f of result.findings.filter((x) => x.level === result.level)) io.out(`  ${f.level}  ${f.path ?? "-"}  ${f.reason}`);
  }
  return EXIT[result.level];
}

export function main(argv = process.argv.slice(2), io = {}) {
  const full = { ...DEFAULT_IO, ...io };
  try {
    return run(argv, full);
  } catch (e) {
    try { full.err(`risk-level: fejl → niveau 3 (fail closed): ${String(e?.message ?? e).split("\n")[0]}`); } catch { /* intet */ }
    return EXIT[3];
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(); } catch { process.exitCode = EXIT[3]; }
}
