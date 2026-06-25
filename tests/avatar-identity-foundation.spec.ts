// Section 152A: Avatar Identity Foundation tests.
// Verifies: backfill shape, set_avatar_identity RPC (accept/reject), trigger
// enforcement against direct garbage writes, anon lockout, zero visual change
// on avatar page / hub / quiz, and avatar_gender flow coexistence.
//
// The test student's avatar_identity and avatar_gender are captured in
// beforeAll and restored in afterAll.

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

// Public anon key — already in deployed frontend JS, not a secret.
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqemJlaHdmYWdpd3B3b2RzZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODc5OTQsImV4cCI6MjA4NzI2Mzk5NH0.BzepnYLe6Khzqx9vTL3Ifa_zMRgjoGQ9Lw5seaoKMMc";

const BODY_TYPES = ["male", "female", "neutral"];
const NEUTRAL_BASE = "/assets/avatar/base/body.svg";

let adminClient:   ReturnType<typeof createClient>;
let anonClient:    ReturnType<typeof createClient>;
let studentClient: ReturnType<typeof createClient>;
let studentId: string;
let originalIdentity: any;
let originalGender: string;

test.beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Pristine anon client — must NEVER sign in (a signIn would store the
  // session in-memory and silently authenticate later anon assertions).
  anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Separate throwaway client for the student sign-in.
  const loginClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error } = await loginClient.auth.signInWithPassword({
    email: STUDENT_EMAIL,
    password: STUDENT_PASS,
  });
  if (error || !session.session) {
    throw new Error(`Student sign-in failed: ${error?.message}`);
  }
  studentId = session.user!.id;

  studentClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error: pError } = await adminClient
    .from("profiles")
    .select("avatar_identity, avatar_gender")
    .eq("id", studentId)
    .maybeSingle();
  if (pError || !profile) throw new Error(`Profile fetch failed: ${pError?.message}`);

  originalIdentity = (profile as any).avatar_identity ?? {};
  originalGender   = (profile as any).avatar_gender ?? "neutral";
});

test.afterAll(async () => {
  // Deterministic suite-safe end state: neutral body, chosen_at SET (so the
  // Section 152C identity prompt never blocks later specs).
  await adminClient
    .from("profiles")
    .update({
      avatar_identity: { v: 1, body_type: "neutral", chosen_at: new Date().toISOString() },
      avatar_gender: originalGender,
    })
    .eq("id", studentId);
});

async function loginAsStudent(page: any) {
  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });
}

test.beforeEach(async ({ page }) => {
  // C2 render exercised in TEST ONLY via a localStorage override (decoupled from the
  // global AVATAR_V2 flag). RPC/trigger tests are unaffected.
  await page.addInitScript(() => { try { localStorage.setItem("avatar_v2", "1"); } catch (e) {} });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test("1. Backfill produced a valid v1 identity for the test student", async ({
  browserName,
}) => {
  test.skip(browserName !== "chromium", "API dedup");

  const identity = originalIdentity;
  expect(identity, "avatar_identity must be an object").toBeTruthy();
  expect(typeof identity).toBe("object");

  // Either never-set ('{}') or a valid v1 shape from the backfill.
  if (Object.keys(identity).length > 0) {
    expect(identity.v).toBe(1);
    expect(BODY_TYPES).toContain(identity.body_type);
  }
});

test("2. set_avatar_identity accepts a valid body_type and stamps chosen_at", async ({
  browserName,
}) => {
  test.skip(browserName !== "chromium", "API dedup");

  const { data, error } = await studentClient.rpc("set_avatar_identity", {
    p_body_type: "female",
  });

  expect(error, `RPC failed: ${error?.message}`).toBeNull();
  expect((data as any)?.v).toBe(1);
  expect((data as any)?.body_type).toBe("female");
  expect((data as any)?.chosen_at, "chosen_at must be stamped").toBeTruthy();

  // Row actually updated.
  const { data: row } = await adminClient
    .from("profiles")
    .select("avatar_identity")
    .eq("id", studentId)
    .maybeSingle();
  expect((row as any)?.avatar_identity?.body_type).toBe("female");
});

test("3. set_avatar_identity rejects an invalid body_type", async ({ browserName }) => {
  test.skip(browserName !== "chromium", "API dedup");

  const { error } = await studentClient.rpc("set_avatar_identity", {
    p_body_type: "dragon",
  });

  expect(error, "invalid body_type must be rejected").not.toBeNull();
});

test("4. Trigger blocks direct garbage writes to avatar_identity", async ({
  browserName,
}) => {
  test.skip(browserName !== "chromium", "API dedup");

  // Unknown key
  const { error: e1 } = await studentClient
    .from("profiles")
    .update({ avatar_identity: { hax: 1 } })
    .eq("id", studentId);
  expect(e1, "unknown keys must be rejected by the trigger").not.toBeNull();

  // Wrong version
  const { error: e2 } = await studentClient
    .from("profiles")
    .update({ avatar_identity: { v: 2, body_type: "male", chosen_at: null } })
    .eq("id", studentId);
  expect(e2, "wrong version must be rejected by the trigger").not.toBeNull();

  // Invalid body_type
  const { error: e3 } = await studentClient
    .from("profiles")
    .update({ avatar_identity: { v: 1, body_type: "dragon", chosen_at: null } })
    .eq("id", studentId);
  expect(e3, "invalid body_type must be rejected by the trigger").not.toBeNull();
});

test("5. anon cannot execute set_avatar_identity", async ({ browserName }) => {
  test.skip(browserName !== "chromium", "API dedup");

  const { error } = await anonClient.rpc("set_avatar_identity", {
    p_body_type: "male",
  });

  expect(error, "anon execute must be rejected").not.toBeNull();
});

// Section 152C: body variants are live — the base layer resolves per body_type.
// (The original 152A "zero visual change" freeze was deliberately lifted by the
// approved 152C scope.)
// C2 base body file per body_type (medium skin — these identities carry no
// skin_tone). AVATAR_V2/C2 render path; C2 forced in-test via localStorage override.
const BODY_FILE_FOR: Record<string, string> = {
  neutral: "body-neutral-medium-c2.svg",
  male:    "body-male-medium-c2.svg",
  female:  "body-female-medium-c2.svg",
};

test("6. Avatar page base layer resolves per body_type", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);

  for (const bodyType of BODY_TYPES) {
    const { error } = await studentClient.rpc("set_avatar_identity", {
      p_body_type: bodyType,
    });
    expect(error, `RPC failed for ${bodyType}: ${error?.message}`).toBeNull();

    await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });

    const expected = BODY_FILE_FOR[bodyType];
    const baseSrc = await page
      .locator(`#avatar-preview img[data-c2-layer="base"][src*="${expected}"]`)
      .count();
    expect(baseSrc, `base layer must be ${expected} for ${bodyType}`).toBeGreaterThanOrEqual(1);
  }
});

test("7. Hub avatar renders the male body when identity is male", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await studentClient.rpc("set_avatar_identity", { p_body_type: "male" });

  await loginAsStudent(page);
  await page.goto(`${PROD}/hub.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#profileAvatar img", { timeout: 15000 });

  const baseCount = await page
    .locator(`#profileAvatar img[data-c2-layer="base"][src*="${BODY_FILE_FOR.male}"]`)
    .count();
  expect(baseCount).toBeGreaterThanOrEqual(1);
});

test("8. Quiz page renders the female body when identity is female", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await studentClient.rpc("set_avatar_identity", { p_body_type: "female" });

  await loginAsStudent(page);
  // Login lands on index.html. The quiz page renders in two phases by design:
  // instant neutral base, then identity resolution after the profile fetch —
  // so the assertion must retry (toBeAttached) rather than count() instantly.
  await page.waitForSelector("#avatar-display img", { timeout: 15000 });

  await expect(
    page.locator(`#avatar-display img[data-c2-layer="base"][src*="${BODY_FILE_FOR.female}"]`)
  ).toBeAttached({ timeout: 15000 });
});

test("9. avatar_gender flow still works alongside avatar_identity", async ({
  browserName,
}) => {
  test.skip(browserName !== "chromium", "API dedup");

  // Direct gender write (the existing Section 143 path) must be unaffected
  // by the identity trigger.
  const { error } = await studentClient
    .from("profiles")
    .update({ avatar_gender: "boy" })
    .eq("id", studentId);
  expect(error, `avatar_gender write failed: ${error?.message}`).toBeNull();

  const { data: row } = await adminClient
    .from("profiles")
    .select("avatar_gender")
    .eq("id", studentId)
    .maybeSingle();
  expect((row as any)?.avatar_gender).toBe("boy");
});
