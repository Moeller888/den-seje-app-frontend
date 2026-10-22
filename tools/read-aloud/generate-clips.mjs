#!/usr/bin/env node
// ── Incremental read-aloud clip generator (157P) ─────────────────────────────
// Builds every text the app can read aloud — active questions, their MC options and the
// static game introductions — exactly as the browser does (same language runs, same
// canonical request, same SHA-256 key), then asks the Worker only for the clips that do
// not exist yet. Existing clips are skipped with one cheap GET each, so re-running after a
// question-bank change only pays for new or edited texts.
//
// The Azure key is never needed here: synthesis happens in the Worker. This script only
// needs the Worker's generator token (TTS_ADMIN_TOKEN) and read access to the questions.
//
//   node tools/read-aloud/generate-clips.mjs --dry-run              count texts and characters
//   node tools/read-aloud/generate-clips.mjs --base http://127.0.0.1:8787 --limit 20
//   node tools/read-aloud/generate-clips.mjs --base https://xn--lrlig-sra.dk
//
// Environment: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read questions; from .env),
// TTS_ADMIN_TOKEN (from the environment, or .dev.vars for a local --base). Values are never
// printed. Only question/option/game text is sent — no pupil data exists in these sources.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalTtsRequest, ttsKey, ttsClipPaths } from "../../js/read-aloud/tts-key.js";
import { segmentQuestion, segmentOption } from "../../js/read-aloud/lang-segments.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GAME_PAGES = ["brud.html", "husk.html", "hop.html", "kloeft.html", "naal.html", "stabel.html"];
const ENGLISH_DOMAIN = "english";

function parseArgs(argv) {
  const args = { base: "https://xn--lrlig-sra.dk", dryRun: false, limit: Infinity, concurrency: 2 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--base") args.base = String(argv[++i] || "").replace(/\/+$/, "");
    else if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg === "--concurrency") args.concurrency = Math.max(1, Math.min(8, Number(argv[++i]) || 1));
    else throw new Error("unknown argument: " + arg);
  }
  return args;
}

/** KEY=value lines; quotes stripped. Used for .env and .dev.vars. Values stay in memory. */
function readEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function decodeEntities(text) {
  return text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

/** The introductions the game pages read aloud (their #<game>-lead paragraph). */
export function gameLeadTexts(repo = REPO) {
  const texts = [];
  for (const page of GAME_PAGES) {
    const html = readFileSync(join(repo, page), "utf8");
    const match = /<p[^>]*\bid="[a-z]+-lead"[^>]*>([\s\S]*?)<\/p>/.exec(html);
    if (match) texts.push({ source: page, text: decodeEntities(match[1].replace(/<[^>]+>/g, "")) });
  }
  return texts;
}

/** Same rule as the quiz adapter: language runs for English, plain Danish otherwise. */
export function readAloudRequestsFor(question) {
  const content = question && question.content && typeof question.content === "object" ? question.content : {};
  const english = question && ((question.metadata && question.metadata.domain) || question.learning_objective) === ENGLISH_DOMAIN;
  const requests = [];
  const runsOrNull = (runs) => (Array.isArray(runs) && runs.length > 0 ? runs : undefined);
  if (typeof content.question === "string" && content.question.trim()) {
    requests.push({ text: content.question, segments: english ? runsOrNull(segmentQuestion(content.question)) : undefined });
  }
  const options = Array.isArray(content.options) ? content.options.filter((o) => typeof o === "string") : [];
  if (question && question.answer_format === "mc") {
    for (const option of options) {
      if (!option.trim()) continue;
      requests.push({
        text: option,
        segments: english ? runsOrNull(segmentOption(option, content.question, options)) : undefined,
      });
    }
  }
  return requests;
}

async function fetchActiveQuestions(env) {
  const url = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env)");
  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(url + "/rest/v1/questions?select=id,answer_format,learning_objective,metadata,content" +
      "&is_active=eq.true&order=id&offset=" + offset + "&limit=1000", { headers: { apikey: key, Authorization: "Bearer " + key } });
    if (!response.ok) throw new Error("questions: HTTP " + response.status);
    const page = await response.json();
    all.push(...page);
    if (page.length < 1000) break;
  }
  return all;
}

/** Unique clips (by key) for a list of requests. */
export async function uniqueClips(requests) {
  const clips = new Map();
  let rejected = 0;
  for (const request of requests) {
    const checked = canonicalTtsRequest(request.text, request.segments);
    if (!checked.ok) { rejected += 1; continue; }
    const key = await ttsKey(checked.value);
    if (!clips.has(key)) clips.set(key, checked.value);
  }
  return { clips, rejected };
}

async function withRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    const response = await fn();
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
      continue;
    }
    return response;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = { ...readEnvFile(join(REPO, ".env")), ...process.env };
  const questions = await fetchActiveQuestions(env);
  const requests = questions.flatMap(readAloudRequestsFor);
  for (const lead of gameLeadTexts()) requests.push({ text: lead.text });
  const { clips, rejected } = await uniqueClips(requests);
  const chars = [...clips.values()].reduce((sum, c) => sum + c.segments.reduce((s, r) => s + r.text.length, 0), 0);
  console.log(JSON.stringify({ questions: questions.length, texts: requests.length, uniqueClips: clips.size, rejected, chars }));
  if (args.dryRun) return;

  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(args.base);
  const token = process.env.TTS_ADMIN_TOKEN || (local ? readEnvFile(join(REPO, ".dev.vars")).TTS_ADMIN_TOKEN : "");
  if (!token) throw new Error("TTS_ADMIN_TOKEN is required (environment, or .dev.vars for a local --base)");

  const queue = [...clips.entries()];
  const stats = { existing: 0, created: 0, failed: 0, createdChars: 0 };
  let attempted = 0;
  async function workerLoop() {
    while (queue.length > 0) {
      const [key, canonical] = queue.shift();
      const head = await withRetry(() => fetch(args.base + ttsClipPaths(key).meta, { method: "HEAD" }));
      if (head.ok) { stats.existing += 1; continue; }
      if (attempted >= args.limit) continue;
      attempted += 1;
      const response = await withRetry(() => fetch(args.base + "/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tts-admin-token": token },
        body: JSON.stringify({ segments: canonical.segments.map((run) => ({ text: run.text, lang: run.lang })) }),
      }));
      if (response.ok) {
        const meta = await response.json();
        if (meta.key !== key) throw new Error("key mismatch between generator and Worker for " + key);
        stats.created += 1;
        stats.createdChars += canonical.segments.reduce((s, r) => s + r.text.length, 0);
      } else {
        stats.failed += 1;
        console.log(JSON.stringify({ key, status: response.status, error: (await response.json().catch(() => ({}))).error }));
      }
      if ((stats.created + stats.failed) % 50 === 0) console.log(JSON.stringify(stats));
    }
  }
  await Promise.all(Array.from({ length: args.concurrency }, workerLoop));
  console.log(JSON.stringify({ done: true, ...stats }));
  if (stats.failed > 0) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("generate-clips failed:", error && error.message ? error.message : error);
    process.exit(1);
  });
}
