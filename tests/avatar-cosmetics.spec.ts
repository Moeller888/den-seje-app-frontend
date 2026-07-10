// Section 154A: Avatar Cosmetics — 4 new face/headwear shop items.
// Tests: shop visibility, equip, unequip, inventory, render, slot enforcement,
// persistence, hub render. Goldens: pixel baselines per item on avatar page +
// pirate-hat on hub. chromium/win32, reduced motion for goldens.

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

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqemJlaHdmYWdpd3B3b2RzZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODc5OTQsImV4cCI6MjA4NzI2Mzk5NH0.BzepnYLe6Khzqx9vTL3Ifa_zMRgjoGQ9Lw5seaoKMMc";

const ITEMS = {
  "pirate-hat": { name: "Pirathat",    slot: "headwear", src: "/assets/avatar/hat/pirate-hat.svg"  },
  "ninja-mask": { name: "Ninja-maske", slot: "face",     src: "/assets/avatar/mask/ninja-mask.svg" },
  "hero-mask":  { name: "Heltemaske",  slot: "face",     src: "/assets/avatar/mask/hero-mask.svg"  },
  "panda-mask": { name: "Pandamaske",  slot: "face",     src: "/assets/avatar/mask/panda-mask.svg" },
} as const;

const todayUTC = new Date().toISOString().slice(0, 10);

const BASE_IDENTITY = () => ({
  v: 1, body_type: "neutral", hairstyle: "default", chosen_at: new Date().toISOString(),
});

let adminClient:   ReturnType<typeof createClient>;
let studentClient: ReturnType<typeof createClient>;
let studentId: string;

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

  // Grant all 4 items to student (idempotent)
  for (const itemId of Object.keys(ITEMS)) {
    const { data: owned } = await adminClient
      .from("user_items").select("item_id")
      .eq("user_id", studentId).eq("item_id", itemId);
    if (!owned || owned.length === 0) {
      const { error: grantErr } = await adminClient
        .from("user_items").insert({ user_id: studentId, item_id: itemId });
      if (grantErr) throw new Error(`Grant ${itemId} failed: ${grantErr.message}`);
    }
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
  await adminClient.from("profiles").update({
    equipped_slots: {},
    avatar_identity: BASE_IDENTITY(),
  }).eq("id", studentId);
});

test.beforeEach(async ({ page }) => {
  // C2 render exercised in TEST ONLY via a localStorage override; the global
  // AVATAR_V2 flag stays false. Cosmetics still render as <img> layers under C2
  // (data-c2-layer="cosmetic"), so the functional item-src assertions are unchanged;
  // only the body underneath changes, which the goldens capture.
  await page.addInitScript(() => { try { localStorage.setItem("avatar_v2", "1"); } catch (e) {} });
});

test.afterAll(async () => {
  await adminClient.from("profiles").update({
    equipped_slots: {},
    avatar_identity: BASE_IDENTITY(),
  }).eq("id", studentId);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

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

async function setEquipped(slots: Record<string, string>) {
  const { error } = await adminClient
    .from("profiles").update({ equipped_slots: slots }).eq("id", studentId);
  if (error) throw new Error(`setEquipped failed: ${error.message}`);
}

// ── Functional tests ──────────────────────────────────────────────────────────

test("1. all 4 items visible in shop", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await page.goto(`${PROD}/shop.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".item-name", { timeout: 15000 });

  for (const { name } of Object.values(ITEMS)) {
    await expect(page.locator(".item-name", { hasText: name }).first()).toBeAttached();
  }
});

test("2. pirate-hat appears in inventory and renders in avatar-preview", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setEquipped({ headwear: "pirate-hat" });
  await loginAsStudent(page);
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#inventoryGrid .item-card", { timeout: 15000 });

  // Inventory check
  await expect(
    page.locator("#inventoryGrid .item-name", { hasText: "Pirathat" })
  ).toBeAttached();

  // Render check
  await expect(
    page.locator(`#avatar-preview img[src*="${ITEMS["pirate-hat"].src}"]`)
  ).toBeAttached({ timeout: 10000 });
});

test("3. pirate-hat unequips — image removed from avatar-preview", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setEquipped({ headwear: "pirate-hat" });
  await loginAsStudent(page);
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#inventoryGrid .item-card", { timeout: 15000 });

  // Verify equipped first
  await expect(
    page.locator(`#avatar-preview img[src*="${ITEMS["pirate-hat"].src}"]`)
  ).toBeAttached({ timeout: 10000 });

  // Click unequip
  await page.locator(`.unequip-btn[data-slot="headwear"]`).click();

  // Image must disappear
  await expect(
    page.locator(`#avatar-preview img[src*="${ITEMS["pirate-hat"].src}"]`)
  ).not.toBeAttached({ timeout: 10000 });
});

test("4. ninja-mask equips — image rendered in avatar-preview", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setEquipped({ face: "ninja-mask" });
  await loginAsStudent(page);
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#inventoryGrid .item-card", { timeout: 15000 });

  await expect(
    page.locator(`#avatar-preview img[src*="${ITEMS["ninja-mask"].src}"]`)
  ).toBeAttached({ timeout: 10000 });
});

test("5. hero-mask equips — image rendered in avatar-preview", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setEquipped({ face: "hero-mask" });
  await loginAsStudent(page);
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#inventoryGrid .item-card", { timeout: 15000 });

  await expect(
    page.locator(`#avatar-preview img[src*="${ITEMS["hero-mask"].src}"]`)
  ).toBeAttached({ timeout: 10000 });
});

test("6. panda-mask equips — image rendered in avatar-preview", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setEquipped({ face: "panda-mask" });
  await loginAsStudent(page);
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#inventoryGrid .item-card", { timeout: 15000 });

  await expect(
    page.locator(`#avatar-preview img[src*="${ITEMS["panda-mask"].src}"]`)
  ).toBeAttached({ timeout: 10000 });
});

test("7. equipping hero-mask replaces ninja-mask — face slot is exclusive", async ({
  browserName,
}) => {
  test.skip(browserName !== "chromium", "API dedup");

  // Equip ninja-mask via RPC
  const { error: e1 } = await studentClient.rpc("equip_item", { p_item_id: "ninja-mask" });
  expect(e1, `equip ninja-mask failed: ${e1?.message}`).toBeNull();

  const { data: after1 } = await adminClient
    .from("profiles").select("equipped_slots").eq("id", studentId).maybeSingle();
  expect((after1 as any)?.equipped_slots?.face).toBe("ninja-mask");

  // Equip hero-mask — must replace ninja-mask in face slot
  const { error: e2 } = await studentClient.rpc("equip_item", { p_item_id: "hero-mask" });
  expect(e2, `equip hero-mask failed: ${e2?.message}`).toBeNull();

  const { data: after2 } = await adminClient
    .from("profiles").select("equipped_slots").eq("id", studentId).maybeSingle();
  expect((after2 as any)?.equipped_slots?.face).toBe("hero-mask");
});

test("8. equipped pirate-hat persists after page reload", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setEquipped({ headwear: "pirate-hat" });
  await loginAsStudent(page);
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#inventoryGrid .item-card", { timeout: 15000 });

  // Reload
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#inventoryGrid .item-card", { timeout: 15000 });

  await expect(
    page.locator(`#avatar-preview img[src*="${ITEMS["pirate-hat"].src}"]`)
  ).toBeAttached({ timeout: 10000 });

  // DB confirms persistence
  const { data: row } = await adminClient
    .from("profiles").select("equipped_slots").eq("id", studentId).maybeSingle();
  expect((row as any)?.equipped_slots?.headwear).toBe("pirate-hat");
});

test("9. hub renders pirate-hat when equipped", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setEquipped({ headwear: "pirate-hat" });
  await loginAsStudent(page);
  await page.goto(`${PROD}/hub.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#profileAvatar img", { timeout: 15000 });

  await expect(
    page.locator(`#profileAvatar img[src*="${ITEMS["pirate-hat"].src}"]`)
  ).toBeAttached({ timeout: 10000 });
});

// ── Golden pixel-regression tests ─────────────────────────────────────────────

test("golden: avatar page pirate-hat matches baseline", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await setEquipped({ headwear: "pirate-hat" });

  await gotoLoginReduced(page);
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });

  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#inventoryGrid .item-card", { timeout: 15000 });
  await waitForImages(page, "#avatar-preview");

  await expect(page.locator("#avatar-preview")).toHaveScreenshot("avatar-page-pirate-hat.png", { maxDiffPixels: 200, animations: "disabled" });
});

test("golden: hub avatar pirate-hat matches baseline", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await setEquipped({ headwear: "pirate-hat" });

  await gotoLoginReduced(page);
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });

  await page.goto(`${PROD}/hub.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#profileAvatar img", { timeout: 15000 });
  await waitForImages(page, "#profileAvatar");

  await expect(page.locator("#profileAvatar")).toHaveScreenshot("hub-avatar-pirate-hat.png", { maxDiffPixels: 120, animations: "disabled" });
});

test("golden: avatar page ninja-mask matches baseline", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await setEquipped({ face: "ninja-mask" });

  await gotoLoginReduced(page);
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });

  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#inventoryGrid .item-card", { timeout: 15000 });
  await waitForImages(page, "#avatar-preview");

  await expect(page.locator("#avatar-preview")).toHaveScreenshot("avatar-page-ninja-mask.png", { maxDiffPixels: 200, animations: "disabled" });
});

test("golden: avatar page hero-mask matches baseline", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await setEquipped({ face: "hero-mask" });

  await gotoLoginReduced(page);
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });

  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#inventoryGrid .item-card", { timeout: 15000 });
  await waitForImages(page, "#avatar-preview");

  await expect(page.locator("#avatar-preview")).toHaveScreenshot("avatar-page-hero-mask.png", { maxDiffPixels: 200, animations: "disabled" });
});

test("golden: avatar page panda-mask matches baseline", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await setEquipped({ face: "panda-mask" });

  await gotoLoginReduced(page);
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });

  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#inventoryGrid .item-card", { timeout: 15000 });
  await waitForImages(page, "#avatar-preview");

  await expect(page.locator("#avatar-preview")).toHaveScreenshot("avatar-page-panda-mask.png", { maxDiffPixels: 200, animations: "disabled" });
});
