// Section 153A: Hairstyle Expansion — 4 new hairstyle variant tests.
// Verifies: all 7 hairstyle buttons render; curly/long/sidecut/buzzcut SVGs load;
// RPC merge semantics preserved for new styles; invalid hairstyle still rejected.
//
// GOLDEN tests: permanent pixel baselines for curly/long/sidecut/buzzcut avatar
// pages, headwear over curly, and hub long. chromium/win32, reduced motion.
// Goldens live in tests/avatar-hairstyle-expansion.spec.ts-snapshots/.

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";
import { PROD } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASS  = process.env.TEST_STUDENT_PASSWORD!;
const SUPABASE_URL  = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqemJlaHdmYWdpd3B3b2RzZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODc5OTQsImV4cCI6MjA4NzI2Mzk5NH0.BzepnYLe6Khzqx9vTL3Ifa_zMRgjoGQ9Lw5seaoKMMc";

// C2 hair assets (AVATAR_V2/C2 render path). Hair renders as an INLINE <svg> with
// NO src — hairstyle is verified via the fetched C2 hair asset + inline hair layer.
// Legacy names ALIAS to C2 styles (HAIR_SRCS_C2 in js/avatar-layers.js):
//   default→short · braid→ponytail · short→short · curly→curly · long→long
//   sidecut→buzz · buzzcut→buzz  (sidecut and buzzcut render the SAME C2 asset)
const HAIR_FILE: Record<string, string> = {
  default:  "hair-short-c2.svg",
  braid:    "hair-ponytail-c2.svg",
  short:    "hair-short-c2.svg",
  curly:    "hair-curly-c2.svg",
  long:     "hair-long-c2.svg",
  sidecut:  "hair-buzz-c2.svg",
  buzzcut:  "hair-buzz-c2.svg",
};

const todayUTC = new Date().toISOString().slice(0, 10);

let adminClient:   ReturnType<typeof createClient>;
let studentClient: ReturnType<typeof createClient>;
let studentId: string;
let headwearItemId: string;

const BASE_IDENTITY = () => ({
  v: 1, body_type: "neutral", hairstyle: "default", chosen_at: new Date().toISOString(),
});

test.beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const loginClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error } = await loginClient.auth.signInWithPassword({
    email: STUDENT_EMAIL, password: STUDENT_PASS,
  });
  if (error || !session.session) throw new Error(`Student sign-in failed: ${error?.message}`);
  studentId = session.user!.id;

  studentClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Deterministic headwear item: first by id
  const { data: hats, error: hatErr } = await adminClient
    .from("shop_items").select("id").eq("slot_type", "headwear").order("id").limit(1);
  if (hatErr || !hats || hats.length === 0)
    throw new Error(`No headwear item found: ${hatErr?.message}`);
  headwearItemId = (hats[0] as any).id;

  // Ensure ownership of the hat (idempotent)
  const { data: owned } = await adminClient
    .from("user_items").select("item_id")
    .eq("user_id", studentId).eq("item_id", headwearItemId);
  if (!owned || owned.length === 0) {
    const { error: grantErr } = await adminClient
      .from("user_items").insert({ user_id: studentId, item_id: headwearItemId });
    if (grantErr) throw new Error(`headwear grant failed: ${grantErr.message}`);
  }

  // Suppress hub daily-reward modal
  const { data: dlr } = await adminClient
    .from("daily_login_rewards").select("student_id")
    .eq("student_id", studentId).maybeSingle();
  if (dlr) {
    await adminClient.from("daily_login_rewards")
      .update({ last_claimed_date: todayUTC }).eq("student_id", studentId);
  } else {
    await adminClient.from("daily_login_rewards")
      .insert({ student_id: studentId, last_claimed_date: todayUTC });
  }
});

test.beforeEach(async () => {
  // Every test starts from a known base: neutral body, default hairstyle, no equipment.
  await adminClient.from("profiles").update({
    equipped_slots: {},
    avatar_identity: BASE_IDENTITY(),
  }).eq("id", studentId);
});

test.beforeEach(async ({ page }) => {
  // C2 render exercised in TEST ONLY via a localStorage override; global AVATAR_V2 stays false.
  // D-101: R2 is now the DEFAULT render. This spec asserts C2-only behaviour (see the file
  // header), so it pins itself to C2 through the supported per-browser opt-out instead of
  // relying on a global default. addInitScript runs before any page script on every
  // navigation, so the choice is made before the avatar mounts. No assertion or golden changes.
  await page.addInitScript(() => {
    try { localStorage.setItem("avatar_v2", "1"); localStorage.setItem("avatar_r2", "0"); } catch (e) {}
  });
});

test.afterAll(async () => {
  // Suite-safe end state: neutral body, default hairstyle.
  await adminClient.from("profiles").update({
    equipped_slots: {},
    avatar_identity: BASE_IDENTITY(),
  }).eq("id", studentId);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setIdentity(identity: object) {
  const { error } = await adminClient
    .from("profiles").update({ avatar_identity: identity }).eq("id", studentId);
  if (error) throw new Error(`identity fixture failed: ${error.message}`);
}

// C2 hair check: run `navigate` (triggers a C2 render), assert the expected aliased
// C2 hair asset was fetched and the inline hair layer is present. Replaces the
// legacy `img[src*=hair-*.svg]` assertion (C2 hair is inline <svg>, no src).
async function expectC2Hair(
  page: any, navigate: () => Promise<void>, hairFile: string, container: string
) {
  const resp = page.waitForResponse(
    (r: any) => r.url().includes(hairFile) && r.status() === 200,
    { timeout: 20000 }
  );
  await navigate();
  await resp;
  await expect(
    page.locator(`${container} [data-c2-layer="hair"] svg`)
  ).toBeAttached({ timeout: 15000 });
}

async function loginAsStudent(page: any) {
  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });
}

async function gotoLoginReduced(page: any) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
}

async function waitForImages(page: any, selector: string) {
  // Wait for the app's render-complete signal (data-avatar-rendered="1"), set once the
  // full avatar composite — base + cosmetics + expression overlay — has decoded. This is
  // the deterministic wait point (#40); the img.complete check below is kept as a supplement.
  await page.waitForSelector(`${selector}[data-avatar-rendered="1"]`, { timeout: 15000 });
  await page.waitForFunction(
    (sel: string) => {
      const imgs = Array.from(document.querySelectorAll(sel + " img"));
      return imgs.length > 0 && imgs.every((i: any) => i.complete && i.naturalWidth > 0);
    },
    selector,
    { timeout: 15000 }
  );
}

// ── Functional tests ──────────────────────────────────────────────────────────

test("1. all 7 hairstyle buttons render on avatar page", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#hairstyleButtons .identity-btn", { timeout: 15000 });

  const buttons = page.locator("#hairstyleButtons .identity-btn");
  await expect(buttons).toHaveCount(7);

  for (const style of ["default", "braid", "short", "curly", "long", "sidecut", "buzzcut"]) {
    await expect(
      page.locator(`#hairstyleButtons .identity-btn[data-hairstyle="${style}"]`)
    ).toBeAttached();
  }
});

test("2. curly hairstyle renders hair-curly.svg on avatar page", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setIdentity({ v: 1, body_type: "neutral", hairstyle: "curly", chosen_at: new Date().toISOString() });

  await loginAsStudent(page);
  await expectC2Hair(page, async () => {
    await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });
  }, HAIR_FILE.curly, "#avatar-preview");
});

test("3. long hairstyle renders hair-long.svg on avatar page", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setIdentity({ v: 1, body_type: "neutral", hairstyle: "long", chosen_at: new Date().toISOString() });

  await loginAsStudent(page);
  await expectC2Hair(page, async () => {
    await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });
  }, HAIR_FILE.long, "#avatar-preview");
});

test("4. sidecut hairstyle renders hair-sidecut.svg on avatar page", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setIdentity({ v: 1, body_type: "neutral", hairstyle: "sidecut", chosen_at: new Date().toISOString() });

  await loginAsStudent(page);
  await expectC2Hair(page, async () => {
    await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });
  }, HAIR_FILE.sidecut, "#avatar-preview");
});

test("5. buzzcut hairstyle renders hair-buzzcut.svg on avatar page", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setIdentity({ v: 1, body_type: "neutral", hairstyle: "buzzcut", chosen_at: new Date().toISOString() });

  await loginAsStudent(page);
  await expectC2Hair(page, async () => {
    await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });
  }, HAIR_FILE.buzzcut, "#avatar-preview");
});

test("6. curly button click updates avatar preview and DB", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#hairstyleButtons .identity-btn", { timeout: 15000 });

  await expectC2Hair(page, async () => {
    await page.locator("#hairstyleButtons .identity-btn[data-hairstyle='curly']").click();
  }, HAIR_FILE.curly, "#avatar-preview");

  const { data: row } = await adminClient
    .from("profiles").select("avatar_identity").eq("id", studentId).maybeSingle();
  expect((row as any)?.avatar_identity?.hairstyle).toBe("curly");
});

test("7. RPC merge — new hairstyle (curly) preserves body_type", async ({
  browserName,
}) => {
  test.skip(browserName !== "chromium", "API dedup");

  await setIdentity({ v: 1, body_type: "female", hairstyle: "default", chosen_at: new Date().toISOString() });

  const { data, error } = await studentClient.rpc("set_avatar_identity", {
    p_hairstyle: "curly",
  });
  expect(error, `RPC failed: ${error?.message}`).toBeNull();
  expect((data as any)?.hairstyle).toBe("curly");
  expect((data as any)?.body_type).toBe("female");
  expect((data as any)?.chosen_at).toBeTruthy();

  const { data: row } = await adminClient
    .from("profiles").select("avatar_identity").eq("id", studentId).maybeSingle();
  expect((row as any)?.avatar_identity?.hairstyle).toBe("curly");
  expect((row as any)?.avatar_identity?.body_type).toBe("female");
});

test("8. body_type change preserves new hairstyle (sidecut)", async ({
  browserName,
}) => {
  test.skip(browserName !== "chromium", "API dedup");

  await setIdentity({ v: 1, body_type: "neutral", hairstyle: "sidecut", chosen_at: new Date().toISOString() });

  const { data, error } = await studentClient.rpc("set_avatar_identity", {
    p_body_type: "male",
  });
  expect(error, `RPC failed: ${error?.message}`).toBeNull();
  expect((data as any)?.body_type).toBe("male");
  expect((data as any)?.hairstyle).toBe("sidecut");

  const { data: row } = await adminClient
    .from("profiles").select("avatar_identity").eq("id", studentId).maybeSingle();
  expect((row as any)?.avatar_identity?.body_type).toBe("male");
  expect((row as any)?.avatar_identity?.hairstyle).toBe("sidecut");
});

test("9. invalid hairstyle still rejected by RPC", async ({ browserName }) => {
  test.skip(browserName !== "chromium", "API dedup");

  const { error } = await studentClient.rpc("set_avatar_identity", {
    p_hairstyle: "pirate",
  });
  expect(error, "invalid hairstyle must be rejected").not.toBeNull();
});

// ── Golden pixel-regression tests ─────────────────────────────────────────────

test("golden: avatar page curly hairstyle matches baseline", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await setIdentity({ v: 1, body_type: "neutral", hairstyle: "curly", chosen_at: new Date().toISOString() });

  await gotoLoginReduced(page);
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });

  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });
  await waitForImages(page, "#avatar-preview");

  await expect(page.locator("#avatar-preview")).toHaveScreenshot("avatar-page-hair-curly.png", { maxDiffPixels: 200, animations: "disabled" });
});

test("golden: avatar page long hairstyle matches baseline", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await setIdentity({ v: 1, body_type: "neutral", hairstyle: "long", chosen_at: new Date().toISOString() });

  await gotoLoginReduced(page);
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });

  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });
  await waitForImages(page, "#avatar-preview");

  await expect(page.locator("#avatar-preview")).toHaveScreenshot("avatar-page-hair-long.png", { maxDiffPixels: 200, animations: "disabled" });
});

test("golden: avatar page sidecut hairstyle matches baseline", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await setIdentity({ v: 1, body_type: "neutral", hairstyle: "sidecut", chosen_at: new Date().toISOString() });

  await gotoLoginReduced(page);
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });

  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });
  await waitForImages(page, "#avatar-preview");

  await expect(page.locator("#avatar-preview")).toHaveScreenshot("avatar-page-hair-sidecut.png", { maxDiffPixels: 200, animations: "disabled" });
});

test("golden: avatar page buzzcut hairstyle matches baseline", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await setIdentity({ v: 1, body_type: "neutral", hairstyle: "buzzcut", chosen_at: new Date().toISOString() });

  await gotoLoginReduced(page);
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });

  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });
  await waitForImages(page, "#avatar-preview");

  await expect(page.locator("#avatar-preview")).toHaveScreenshot("avatar-page-hair-buzzcut.png", { maxDiffPixels: 200, animations: "disabled" });
});

test("golden: avatar page headwear over curly matches baseline", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await setIdentity({ v: 1, body_type: "neutral", hairstyle: "curly", chosen_at: new Date().toISOString() });
  await adminClient.from("profiles")
    .update({ equipped_slots: { headwear: headwearItemId } }).eq("id", studentId);

  await gotoLoginReduced(page);
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });

  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });
  await waitForImages(page, "#avatar-preview");

  await expect(page.locator("#avatar-preview")).toHaveScreenshot("avatar-page-headwear-hair-curly.png", { maxDiffPixels: 200, animations: "disabled" });
});

test("golden: hub avatar long hairstyle matches baseline", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await setIdentity({ v: 1, body_type: "neutral", hairstyle: "long", chosen_at: new Date().toISOString() });

  await gotoLoginReduced(page);
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });

  await page.goto(`${PROD}/hub.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#profileAvatar img", { timeout: 15000 });
  await waitForImages(page, "#profileAvatar");

  await expect(page.locator("#profileAvatar")).toHaveScreenshot("hub-avatar-hair-long.png", { maxDiffPixels: 120, animations: "disabled" });
});
