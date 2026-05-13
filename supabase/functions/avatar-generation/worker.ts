import type { SupabaseClient } from "./supabase.ts";
import { getServiceClient } from "./supabase.ts";
import { claimGenerationJob, recoverStuckJob, resetJobForRetry } from "./database.ts";
import { runGenerationPipeline } from "./pipeline.ts";

const STALE_THRESHOLD_MINUTES = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findOneStuckJob(
  supabase: SupabaseClient,
): Promise<{ id: string; claimed_at: string } | null> {
  const thresholdTs = new Date(
    Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .from("avatar_generation_jobs")
    .select("id, claimed_at")
    .eq("status", "generating")
    .lt("claimed_at", thresholdTs)
    .order("claimed_at", { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0] as { id: string; claimed_at: string };
}

async function findOneFailedRetryableJob(
  supabase: SupabaseClient,
): Promise<{ id: string; retry_count: number } | null> {
  const { data, error } = await supabase
    .from("avatar_generation_jobs")
    .select("id, retry_count")
    .eq("status", "failed_retryable")
    .lt("retry_count", 3)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0] as { id: string; retry_count: number };
}

async function findOnePendingJob(
  supabase: SupabaseClient,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("avatar_generation_jobs")
    .select("id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0] as { id: string };
}

export async function runWorker(): Promise<void> {
  let isProcessing = false;

  while (true) {
    if (isProcessing) {
      await sleep(500 + Math.random() * 1000);
      continue;
    }

    const supabase = getServiceClient();
    try {
      let didWork = false;

      const stuck = await findOneStuckJob(supabase);
      if (stuck !== null) {
        await recoverStuckJob(supabase, stuck.id, stuck.claimed_at);
        didWork = true;
      }

      const failed = await findOneFailedRetryableJob(supabase);
      if (failed !== null) {
        await resetJobForRetry(supabase, failed.id, failed.retry_count);
        didWork = true;
      }

      const pending = await findOnePendingJob(supabase);
      if (pending !== null) {
        console.log("[worker] pending job found:", pending.id);
        const claimed = await claimGenerationJob(supabase, pending.id);
        console.log("[worker] claimGenerationJob result:", claimed !== null ? "claimed" : "null — lost race or already taken");
        if (claimed !== null) {
          isProcessing = true;
          console.log("[worker] calling runGenerationPipeline", claimed.id);
          try {
            await runGenerationPipeline(getServiceClient(), claimed);
          } catch (err) {
            console.error("[PIPELINE ERROR]", claimed.id, err);
            if (err instanceof Error) {
              console.error("[PIPELINE ERROR MESSAGE]", err.message);
              console.error("[PIPELINE ERROR STACK]", err.stack);
            }
            throw err;
          } finally {
            isProcessing = false;
          }
          didWork = true;
        }
      }

      if (!didWork) {
        await sleep(500 + Math.random() * 1000);
      }
    } catch (err) {
      isProcessing = false;
      console.error("[PIPELINE ERROR]", err);
      if (err instanceof Error) {
        console.error("[PIPELINE ERROR MESSAGE]", err.message);
        console.error("[PIPELINE ERROR STACK]", err.stack);
      }
      await sleep(3000 + Math.random() * 2000);
    }
  }
}

if (import.meta.main) {
  runWorker();
}
