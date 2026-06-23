// Section 151B: Living Hub Avatar — life engines + reward-moment reactions on hub.html.
// Verifies: engine mount (expression/blink/breathing), achievement unlock reaction,
// daily + weekly quest claim reactions, daily reward modal reaction, welcome-back,
// and reduced-motion behavior.
//
// Economy safety: coins are snapshotted in beforeAll and restored in afterAll, so
// quest/daily-reward claims performed by these tests are economy-neutral. The
// achievement fixture uses first_correct (title reward, ON CONFLICT DO NOTHING) —
// re-unlocking grants no coins.

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PROD          = "https://den-seje-app-frontend.vercel.app";
const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASS  = process.env.TEST_STUDENT_PASSWORD!;
const SUPABASE_URL  = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient>;
let studentId: string;
let coinsSnapshot: number;

let dailyQuest: { id: string; target: number };
let weeklyQuest: { id: string; target: number };

const todayUTC = new Date().toISOString().slice(0, 10);
const yesterdayUTC = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

// Mirrors hub.html getISOWeekKey() / PostgreSQL TO_CHAR(CURRENT_DATE, 'IYYY-IW')
function getISOWeekKey(): string {
  const d = new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = date.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const weekNum = Math.ceil((((date as any) - (startOfYear as any)) / 86400000 + 1) / 7);
  return year + "-" + String(weekNum).padStart(2, "0");
}
const currentWeekKey = getISOWeekKey();

test.beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: usersData } = await adminClient.auth.admin.listUsers();
  const student = (usersData?.users ?? []).find((u) => u.email === STUDENT_EMAIL);
  if (!student) throw new Error(`Test student not found: ${STUDENT_EMAIL}`);
  studentId = student.id;

  // Economy snapshot — restored in afterAll so claims here are net-zero.
  const { data: progress, error: progError } = await adminClient
    .from("student_progress")
    .select("coins")
    .eq("student_id", studentId);
  if (progError) throw new Error(`coins snapshot failed: ${progError.message}`);
  coinsSnapshot = (progress?.[0] as any)?.coins ?? 0;

  // Active daily + weekly quest definitions (same filters as hub.html).
  const { data: dq, error: dqError } = await adminClient
    .from("daily_quests")
    .select("id, target")
    .eq("is_active", true)
    .order("sort_order")
    .limit(1);
  if (dqError) throw new Error(`daily_quests query failed: ${dqError.message}`);
  if (!dq || dq.length === 0) throw new Error("No active daily quest found");
  dailyQuest = dq[0] as any;

  const { data: wq, error: wqError } = await adminClient
    .from("weekly_quests")
    .select("id, target")
    .eq("is_active", true)
    .order("sort_order")
    .limit(1);
  if (wqError) throw new Error(`weekly_quests query failed: ${wqError.message}`);
  if (!wq || wq.length === 0) throw new Error("No active weekly quest found");
  weeklyQuest = wq[0] as any;
});

test.afterAll(async () => {
  // Restore the coin balance — all claims performed by this spec are rolled back.
  await adminClient
    .from("student_progress")
    .update({ coins: coinsSnapshot })
    .eq("student_id", studentId);
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Prevent the daily reward auto-claim modal from appearing (it blocks clicks).
async function markDailyRewardClaimedToday() {
  const { data: row } = await adminClient
    .from("daily_login_rewards")
    .select("student_id")
    .eq("student_id", studentId)
    .maybeSingle();

  if (row) {
    await adminClient
      .from("daily_login_rewards")
      .update({ last_claimed_date: todayUTC })
      .eq("student_id", studentId);
  } else {
    await adminClient
      .from("daily_login_rewards")
      .insert({ student_id: studentId, last_claimed_date: todayUTC });
  }
}

// Make the daily reward claimable on next hub load.
async function markDailyRewardClaimableToday() {
  const { data: row } = await adminClient
    .from("daily_login_rewards")
    .select("student_id")
    .eq("student_id", studentId)
    .maybeSingle();

  if (row) {
    await adminClient
      .from("daily_login_rewards")
      .update({ last_claimed_date: yesterdayUTC })
      .eq("student_id", studentId);
  } else {
    await adminClient
      .from("daily_login_rewards")
      .insert({ student_id: studentId, last_claimed_date: yesterdayUTC });
  }
}

// Set a quest to completed-but-unclaimed so the "Hent!" button renders.
async function makeDailyQuestClaimable() {
  await adminClient
    .from("student_quest_progress")
    .delete()
    .eq("student_id", studentId)
    .eq("quest_id", dailyQuest.id)
    .eq("quest_date", todayUTC);

  const { error } = await adminClient.from("student_quest_progress").insert({
    student_id: studentId,
    quest_id: dailyQuest.id,
    quest_date: todayUTC,
    progress: dailyQuest.target,
    completed: true,
    claimed: false,
  });
  if (error) throw new Error(`daily quest fixture failed: ${error.message}`);
}

async function makeWeeklyQuestClaimable() {
  await adminClient
    .from("student_weekly_quest_progress")
    .delete()
    .eq("student_id", studentId)
    .eq("quest_id", weeklyQuest.id)
    .eq("week_key", currentWeekKey);

  const { error } = await adminClient.from("student_weekly_quest_progress").insert({
    student_id: studentId,
    quest_id: weeklyQuest.id,
    week_key: currentWeekKey,
    progress: weeklyQuest.target,
    completed: true,
    claimed: false,
  });
  if (error) throw new Error(`weekly quest fixture failed: ${error.message}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginAsStudent(page: any) {
  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });
}

async function openHubPage(page: any) {
  await page.goto(`${PROD}/hub.html`, { waitUntil: "domcontentloaded" });
  // At least one avatar layer — signals renderProfileAvatar() (and engine init) ran.
  await page.waitForSelector("#profileAvatar img", { timeout: 15000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("1. Hub avatar mounts all life engines", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await markDailyRewardClaimedToday();
  await loginAsStudent(page);
  await openHubPage(page);

  // Expression overlay mounted with a real expression asset.
  const overlay = page.locator("#profileAvatar .avatar-expr-overlay");
  await expect(overlay).toBeAttached();
  await expect(overlay).toHaveAttribute("src", /expressions\/expr-/);

  // Blink layer with two eyelid ellipses.
  const blinkLayer = page.locator("#profileAvatar #avatar-blink-layer");
  await expect(blinkLayer).toBeAttached();
  await expect(blinkLayer.locator("ellipse")).toHaveCount(2);

  // Breathing animation active on the avatar.
  const animationName = await page
    .locator("#profileAvatar")
    .evaluate((el: Element) => getComputedStyle(el).animationName);
  expect(animationName).not.toBe("none");
});

test("2. Achievement unlock triggers critical proud reaction", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await markDailyRewardClaimedToday();

  // Remove first_correct so evaluate_achievements re-unlocks it on hub load.
  // Its reward is the 'rookie' title (ON CONFLICT DO NOTHING) — no coin drift.
  const { error } = await adminClient
    .from("user_achievements")
    .delete()
    .eq("student_id", studentId)
    .eq("achievement_id", "first_correct");
  if (error) throw new Error(`achievement fixture failed: ${error.message}`);

  await loginAsStudent(page);
  await openHubPage(page);

  // evaluate_achievements → toast → ACHIEVEMENT_UNLOCK reaction (RPC chain: ~1-2s).
  await expect(page.locator("#avatarShowcase")).toHaveAttribute(
    "data-avatar-reaction",
    "achievement",
    { timeout: 15000 }
  );
  await expect(page.locator("#profileAvatar .avatar-expr-overlay")).toHaveAttribute(
    "src",
    /expr-proud\.svg/
  );
});

test("3. Daily quest claim triggers reward reaction", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await markDailyRewardClaimedToday();
  await makeDailyQuestClaimable();

  await loginAsStudent(page);
  await openHubPage(page);

  const claimBtn = page.locator(`.quest-claim-btn[data-quest-id="${dailyQuest.id}"]`);
  await expect(claimBtn).toBeVisible({ timeout: 15000 });
  await claimBtn.click();

  // Claim completes (button flips) AND the avatar reacts.
  await expect(claimBtn).toHaveText(/Hentet/, { timeout: 15000 });
  await expect(page.locator("#avatarShowcase")).toHaveAttribute(
    "data-avatar-reaction",
    "reward"
  );
  await expect(page.locator("#profileAvatar .avatar-expr-overlay")).toHaveAttribute(
    "src",
    /expr-proud\.svg/
  );
});

test("4. Weekly quest claim triggers reward reaction", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await markDailyRewardClaimedToday();
  await makeWeeklyQuestClaimable();

  await loginAsStudent(page);
  await openHubPage(page);

  const claimBtn = page.locator(
    `.quest-claim-btn[data-weekly-quest-id="${weeklyQuest.id}"]`
  );
  await expect(claimBtn).toBeVisible({ timeout: 15000 });
  await claimBtn.click();

  await expect(claimBtn).toHaveText(/Hentet/, { timeout: 15000 });
  await expect(page.locator("#avatarShowcase")).toHaveAttribute(
    "data-avatar-reaction",
    "reward"
  );
});

test("5. Daily reward claim reacts on modal dismiss", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await markDailyRewardClaimableToday();

  await loginAsStudent(page);
  await openHubPage(page);

  // Auto-claim shows the reward modal.
  const overlay = page.locator("#dailyRewardOverlay.visible");
  await expect(overlay).toBeVisible({ timeout: 15000 });

  await page.locator("#droDismissBtn").click();
  await expect(overlay).toBeHidden();

  // Reaction fires on dismiss: "reward", or "achievement" on a streak milestone.
  await expect(page.locator("#avatarShowcase")).toHaveAttribute(
    "data-avatar-reaction",
    /^(reward|achievement)$/
  );
  await expect(page.locator("#profileAvatar .avatar-expr-overlay")).toHaveAttribute(
    "src",
    /expr-proud\.svg/
  );
});

test("6. Welcome-back after >=30s hidden triggers curious reaction", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await markDailyRewardClaimedToday();
  await loginAsStudent(page);
  await openHubPage(page);

  // Synthetic visibility cycle: hide, jump Date.now past the 30s threshold,
  // show. Tests the handler path — real tab-hiding is unreachable in headless.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    const realNow = Date.now;
    Date.now = () => realNow() + 31000;
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Date.now = realNow;
  });

  await expect(page.locator("#avatarShowcase")).toHaveAttribute(
    "data-avatar-reaction",
    "welcome-back"
  );
  await expect(page.locator("#profileAvatar .avatar-expr-overlay")).toHaveAttribute(
    "src",
    /expr-curious\.svg/
  );
});

// ── Reduced motion ────────────────────────────────────────────────────────────
// page.emulateMedia, NOT test.use({ reducedMotion }) — the latter is silently
// ignored in this harness (proven during Section 151A).

test("7. Reduced motion disables animation but engines stay mounted", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await markDailyRewardClaimedToday();
  await loginAsStudent(page);
  await openHubPage(page);

  // Blink layer is never built under reduced motion.
  await expect(page.locator("#avatar-blink-layer")).toHaveCount(0);

  // Expression overlay still mounts — instant swaps instead of fades.
  await expect(page.locator("#profileAvatar .avatar-expr-overlay")).toBeAttached();

  // Breathing disabled by the media query.
  const animationName = await page
    .locator("#profileAvatar")
    .evaluate((el: Element) => getComputedStyle(el).animationName);
  expect(animationName).toBe("none");
});
