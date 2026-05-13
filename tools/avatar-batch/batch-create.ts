#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Avatar generation batch job creator.
 *
 * Creates N avatar generation jobs via the pipeline /init endpoint for use
 * in sequential and concurrent pipeline batch tests.
 *
 * Run from the project root:
 *   deno run --allow-net --allow-env --allow-read \
 *     tools/avatar-batch/batch-create.ts [flags]
 *
 * Or with explicit env file loading (Deno 2.x):
 *   deno run --env-file .env --allow-net --allow-env --allow-read \
 *     tools/avatar-batch/batch-create.ts [flags]
 *
 * Flags:
 *   --count=N              Number of jobs to create (default: 10)
 *   --slot=hat             Avatar slot (default: hat — only valid slot in v1)
 *   --prompt-prefix=STR    Prefix prepended to each generated prompt
 *   --initiated-by=STR     initiated_by prefix (default: batch-seq)
 *                          Use batch-conc for concurrent test runs
 *   --delay=MS             Delay between requests in ms (default: 200)
 *   --env-file=PATH        Path to .env file (default: .env)
 *   --model-provider=STR   model_provider field (default: stub)
 *   --model-version=STR    model_version field (default: 1.0)
 *   --policy-prompt=STR    policy_prompt field (default: standard-content-policy-v1)
 *   --help                 Show this help message
 *
 * Environment variables required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

// ── Prompt variants ───────────────────────────────────────────────────────────
// 20 unique hat descriptions. Index wraps around for count > 20.

const PROMPT_VARIANTS: readonly string[] = [
  "a wide-brimmed sun hat with floral decoration",
  "a classic baseball cap with a curved peak",
  "a tall wizard hat with silver star patterns",
  "a soft wool beanie in a solid color",
  "a pirate tricorn hat with a golden buckle",
  "a cowboy hat with a wide flat brim",
  "a jester hat with bells on the tips",
  "a detective fedora with a narrow brim",
  "a paper crown with jagged golden edges",
  "a safari pith helmet in khaki",
  "a chef toque in bright white",
  "a graduation mortarboard with a tassel",
  "a knight helmet with a visor and plume",
  "a party hat with polka dots and a pom-pom",
  "a viking helmet with small decorative horns",
  "a top hat in glossy black",
  "a flower crown woven from colorful blooms",
  "a military beret in dark green",
  "a hardhat in bright yellow",
  "a sombrero with colorful embroidered trim",
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface BatchConfig {
  count: number;
  slot: string;
  promptPrefix: string;
  initiatedByPrefix: string;
  delayMs: number;
  modelProvider: string;
  modelVersion: string;
  policyPrompt: string;
}

interface JobResult {
  index: number;
  jobId: string | null;
  targetAssetId: string | null;
  initiatedBy: string;
  prompt: string;
  success: boolean;
  error: string | null;
}

// ── Env loading ───────────────────────────────────────────────────────────────
// Reads a .env file and sets any key not already present in the environment.
// Shell environment always takes precedence. Non-fatal if file is absent.

async function loadEnvFile(path: string): Promise<void> {
  let raw: string;
  try {
    raw = await Deno.readTextFile(path);
  } catch {
    return;
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !Deno.env.get(key)) {
      Deno.env.set(key, value);
    }
  }
}

// ── CLI arg parsing ───────────────────────────────────────────────────────────

interface ParsedArgs {
  config: BatchConfig;
  envFile: string;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string> = {};
  for (const arg of argv) {
    const m = arg.match(/^--([a-z][a-z0-9-]*)(?:=(.*))?$/);
    if (m) {
      flags[m[1]] = m[2] ?? "true";
    }
  }

  if ("help" in flags || "h" in flags) {
    return {
      config: {} as BatchConfig,
      envFile: ".env",
      help: true,
    };
  }

  const count = parseInt(flags["count"] ?? "10", 10);
  const delayMs = parseInt(flags["delay"] ?? "200", 10);

  if (isNaN(count) || count < 1) {
    die("--count must be a positive integer");
  }
  if (isNaN(delayMs) || delayMs < 0) {
    die("--delay must be a non-negative integer (0 = no delay)");
  }

  return {
    config: {
      count,
      slot: flags["slot"] ?? "hat",
      promptPrefix: flags["prompt-prefix"] ?? "",
      initiatedByPrefix: flags["initiated-by"] ?? "batch-seq",
      delayMs,
      modelProvider: flags["model-provider"] ?? "stub",
      modelVersion: flags["model-version"] ?? "1.0",
      policyPrompt: flags["policy-prompt"] ?? "standard-content-policy-v1",
    },
    envFile: flags["env-file"] ?? ".env",
    help: false,
  };
}

// ── Prompt generation ─────────────────────────────────────────────────────────

function buildPrompt(prefix: string, index: number): string {
  const variant = PROMPT_VARIANTS[index % PROMPT_VARIANTS.length];
  return prefix ? `${prefix} — ${variant}` : variant;
}

// ── API call ──────────────────────────────────────────────────────────────────

async function callInit(
  baseUrl: string,
  serviceKey: string,
  config: BatchConfig,
  promptIndex: number,
  initiatedBy: string,
): Promise<{ jobId: string; targetAssetId: string }> {
  const prompt = buildPrompt(config.promptPrefix, promptIndex);

  const payload = {
    slot: config.slot,
    generation_prompt: prompt,
    negative_prompt: null,
    policy_prompt: config.policyPrompt,
    model_provider: config.modelProvider,
    model_version: config.modelVersion,
    initiated_by: initiatedBy,
  };

  const url = `${baseUrl}/functions/v1/avatar-generation/init`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    throw new Error(`Network error: ${msg}`);
  }

  const responseText = await response.text();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    throw new Error(
      `HTTP ${response.status}: non-JSON response — ${responseText.slice(0, 300)}`,
    );
  }

  if (!response.ok || parsed["success"] !== true) {
    const message =
      typeof parsed["message"] === "string"
        ? parsed["message"]
        : responseText.slice(0, 300);
    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  const job = parsed["job"];
  if (job === null || typeof job !== "object" || Array.isArray(job)) {
    throw new Error("Response missing job object");
  }

  const jobRecord = job as Record<string, unknown>;
  const jobId = jobRecord["id"];
  const targetAssetId = jobRecord["target_asset_id"];

  if (typeof jobId !== "string" || jobId.trim() === "") {
    throw new Error("Response job missing id field");
  }
  if (typeof targetAssetId !== "string" || targetAssetId.trim() === "") {
    throw new Error("Response job missing target_asset_id field");
  }

  return { jobId, targetAssetId };
}

// ── Formatting ────────────────────────────────────────────────────────────────

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function hr(width = 72): string {
  return "─".repeat(width);
}

function printHelp(): void {
  console.log(`
avatar-batch — creates N avatar generation jobs for pipeline batch testing

USAGE
  deno run --allow-net --allow-env --allow-read \\
    tools/avatar-batch/batch-create.ts [flags]

  # With explicit .env loading (Deno 2.x):
  deno run --env-file .env --allow-net --allow-env --allow-read \\
    tools/avatar-batch/batch-create.ts [flags]

FLAGS
  --count=N              Number of jobs (default: 10)
  --slot=STR             Avatar slot (default: hat — only valid slot in v1)
  --prompt-prefix=STR    Prefix prepended to each generated prompt
  --initiated-by=STR     initiated_by prefix (default: batch-seq)
                         Use batch-conc for concurrent test runs
  --delay=MS             Delay between requests in ms (default: 200)
  --env-file=PATH        Path to .env file (default: .env)
  --model-provider=STR   model_provider field (default: stub)
  --model-version=STR    model_version field (default: 1.0)
  --policy-prompt=STR    policy_prompt field (default: standard-content-policy-v1)
  --help                 Show this help

ENVIRONMENT
  SUPABASE_URL              Required — project URL
  SUPABASE_SERVICE_ROLE_KEY Required — service role key (bypasses RLS)

EXAMPLES
  # Sequential batch — 10 jobs (test plan default)
  deno run --allow-net --allow-env --allow-read \\
    tools/avatar-batch/batch-create.ts

  # Concurrent batch — 20 jobs
  deno run --allow-net --allow-env --allow-read \\
    tools/avatar-batch/batch-create.ts --count=20 --initiated-by=batch-conc

  # Custom count, faster (no delay)
  deno run --allow-net --allow-env --allow-read \\
    tools/avatar-batch/batch-create.ts --count=5 --delay=0

NOTES
  All jobs in one run share the same initiated_by value (prefix + run ID).
  The run ID is an 8-char hex timestamp, e.g. batch-seq-1a2b3c4d.
  SQL verification: WHERE initiated_by = '<value printed in summary>'
`.trim());
}

function printSummary(
  results: JobResult[],
  runID: string,
  config: BatchConfig,
): void {
  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const initiatedBy = results[0]?.initiatedBy ?? "—";

  console.log("\n" + hr());
  console.log("BATCH SUMMARY");
  console.log(hr());
  console.log(`  run_id       : ${runID}`);
  console.log(`  slot         : ${config.slot}`);
  console.log(`  initiated_by : ${initiatedBy}`);
  console.log(`  requested    : ${config.count}`);
  console.log(`  succeeded    : ${succeeded.length}`);
  console.log(`  failed       : ${failed.length}`);

  if (succeeded.length > 0) {
    console.log("\nSUBMITTED JOBS");
    console.log(hr());
    for (const r of succeeded) {
      console.log(`  [${pad(r.index, String(config.count).length)}]  ${r.jobId}  →  ${r.targetAssetId}`);
    }
  }

  if (failed.length > 0) {
    console.log("\nFAILED JOBS");
    console.log(hr());
    for (const r of failed) {
      console.log(`  [${pad(r.index, String(config.count).length)}]  ${r.error}`);
    }
  }

  if (succeeded.length > 0) {
    console.log("\nVERIFICATION QUERY (run after worker completes all jobs)");
    console.log(hr());
    console.log(`  SELECT status, COUNT(*)`);
    console.log(`    FROM avatar_generation_jobs`);
    console.log(`    WHERE initiated_by = '${initiatedBy}'`);
    console.log(`    GROUP BY status;`);
    console.log(`  -- Expected when all complete: complete ${succeeded.length}`);
  }

  console.log("\n" + hr());
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function die(message: string): never {
  console.error(`ERROR: ${message}`);
  Deno.exit(1);
}

function generateRunId(): string {
  return Date.now().toString(16).slice(-8);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { config, envFile, help } = parseArgs(Deno.args.slice());

  if (help) {
    printHelp();
    Deno.exit(0);
  }

  // Load .env file before reading env vars.
  await loadEnvFile(envFile);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || supabaseUrl.trim() === "") {
    die("SUPABASE_URL is not set. Add it to .env or set it in the shell.");
  }
  if (!serviceKey || serviceKey.trim() === "") {
    die("SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env or set it in the shell.");
  }

  const baseUrl = supabaseUrl.replace(/\/$/, "");
  const runID = generateRunId();
  const initiatedBy = `${config.initiatedByPrefix}-${runID}`;
  const total = config.count;
  const indexWidth = String(total).length;

  console.log(hr());
  console.log("AVATAR BATCH JOB CREATOR");
  console.log(hr());
  console.log(`  target       : ${baseUrl}`);
  console.log(`  slot         : ${config.slot}`);
  console.log(`  count        : ${total}`);
  console.log(`  initiated_by : ${initiatedBy}`);
  console.log(`  delay        : ${config.delayMs}ms between requests`);
  console.log(`  model        : ${config.modelProvider} @ ${config.modelVersion}`);
  console.log(hr());
  console.log();

  const results: JobResult[] = [];

  for (let i = 0; i < total; i++) {
    const label = `[${pad(i + 1, indexWidth)}/${total}]`;
    const prompt = buildPrompt(config.promptPrefix, i);

    let jobId: string;
    let targetAssetId: string;

    try {
      ({ jobId, targetAssetId } = await callInit(
        baseUrl,
        serviceKey,
        config,
        i,
        initiatedBy,
      ));

      console.log(`${label}  OK      ${jobId}  →  ${targetAssetId}`);
      console.log(`${"".padStart(label.length)}  prompt: "${prompt}"`);

      results.push({
        index: i + 1,
        jobId,
        targetAssetId,
        initiatedBy,
        prompt,
        success: true,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${label}  FAILED  ${message}`);

      results.push({
        index: i + 1,
        jobId: null,
        targetAssetId: null,
        initiatedBy,
        prompt,
        success: false,
        error: message,
      });

      console.error("\nBATCH ABORTED — fail-fast on first error.");
      printSummary(results, runID, config);
      Deno.exit(1);
    }

    if (i < total - 1 && config.delayMs > 0) {
      await sleep(config.delayMs);
    }
  }

  printSummary(results, runID, config);
}

await main();
