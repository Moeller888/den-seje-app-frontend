// Section 151A: Avatar lives everywhere — life engines + equip reactions on avatar.html.
// Verifies: expression overlay mounts, blink layer initializes, equip/unequip trigger
// graded avatar reactions (data-avatar-reaction on #avatarWrap), legendary takes the
// critical path, and prefers-reduced-motion disables animation without breaking state.

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

// Discovered from shop_items in beforeAll — no hardcoded item ids.
let lowerItemId: string;        // common (fallback: uncommon) equipable item
let lowerItemSlot: string;      // its slot_type (drives the unequip button selector)
let lowerReaction: string;      // "equip-common" | "equip-uncommon"
let legendaryItemId: string;    // legendary equipable item

test.beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: usersData } = await adminClient.auth.admin.listUsers();
  const student = (usersData?.users ?? []).find((u) => u.email === STUDENT_EMAIL);
  if (!student) throw new Error(`Test student not found: ${STUDENT_EMAIL}`);
  studentId = student.id;

  // Pick one low-rarity and one legendary equipable item from the live catalog.
  const { data: items, error: itemsError } = await adminClient
    .from("shop_items")
    .select("id, rarity, slot_type, image_url")
    .not("slot_type", "is", null)
    .not("image_url", "is", null);

  if (itemsError) throw new Error(`shop_items query failed: ${itemsError.message}`);

  const rows = (items ?? []) as Array<{ id: string; rarity: string; slot_type: string }>;
  const legendary = rows.find((r) => r.rarity === "legendary");
  const lower =
    rows.find((r) => r.rarity === "common") ??
    rows.find((r) => r.rarity === "uncommon");

  if (!legendary) throw new Error("No legendary equipable item found in shop_items");
  if (!lower) throw new Error("No common/uncommon equipable item found in shop_items");

  legendaryItemId = legendary.id;
  lowerItemId     = lower.id;
  lowerItemSlot   = lower.slot_type;
  lowerReaction   = "equip-" + lower.rarity;

  // Ensure the test student owns both items (insert only what is missing).
  const { data: existing, error: ownError } = await adminClient
    .from("user_items")
    .select("item_id")
    .eq("user_id", studentId)
    .in("item_id", [lowerItemId, legendaryItemId]);

  if (ownError) throw new Error(`user_items query failed: ${ownError.message}`);

  const have = new Set((existing ?? []).map((r: any) => r.item_id));
  const missing = [lowerItemId, legendaryItemId]
    .filter((id) => !have.has(id))
    .map((id) => ({ user_id: studentId, item_id: id }));

  if (missing.length > 0) {
    const { error: insError } = await adminClient.from("user_items").insert(missing);
    if (insError) throw new Error(`user_items insert failed: ${insError.message}`);
  }
});

test.beforeEach(async () => {
  // Start every test unequipped so equip buttons are always available.
  await adminClient.from("profiles").update({ equipped_slots: {} }).eq("id", studentId);
});

test.beforeEach(async ({ page }) => {
  // C2 render exercised in TEST ONLY via a localStorage override (decoupled from the
  // global AVATAR_V2 flag). The expression/blink/reaction engines must still mount
  // on the C2 render path — this is exactly what these tests verify.
  await page.addInitScript(() => { try { localStorage.setItem("avatar_v2", "1"); } catch (e) {} });
});

test.afterAll(async () => {
  // Leave the test account in a clean unequipped state.
  await adminClient.from("profiles").update({ equipped_slots: {} }).eq("id", studentId);
});

async function loginAsStudent(page: any) {
  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });
}

async function openAvatarPage(page: any) {
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  // Identity buttons render at the end of loadAll() — signals data + render complete.
  await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("1. Avatar loads with base body layer", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await openAvatarPage(page);

  // Base body layer renders inside the preview.
  const layerCount = await page.locator("#avatar-preview img.avatar-layer").count();
  expect(layerCount).toBeGreaterThanOrEqual(1);
});

test("2. Expression layer mounts", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await openAvatarPage(page);

  const overlay = page.locator("#avatar-preview .avatar-expr-overlay");
  await expect(overlay).toBeAttached();
  // Idle state shows a real expression asset (neutral on load).
  await expect(overlay).toHaveAttribute("src", /expressions\/expr-/);
});

test("3. Blink system initializes", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await openAvatarPage(page);

  const blinkLayer = page.locator("#avatar-preview #avatar-blink-layer");
  await expect(blinkLayer).toBeAttached();
  // Two eyelid ellipses — one per eye.
  await expect(blinkLayer.locator("ellipse")).toHaveCount(2);
});

test("4. Equip triggers proud reaction, unequip triggers curious", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await openAvatarPage(page);

  // Equip the low-rarity item.
  await page.locator(`.equip-btn[data-item-id="${lowerItemId}"]`).click();

  // Reaction state appears on the wrap, graded by the item's rarity.
  await expect(page.locator("#avatarWrap")).toHaveAttribute(
    "data-avatar-reaction",
    lowerReaction
  );
  // The face turns proud.
  await expect(page.locator("#avatar-preview .avatar-expr-overlay")).toHaveAttribute(
    "src",
    /expr-proud\.svg/
  );

  // Reaction state clears after its hold duration (engine yields back to idle).
  await expect(page.locator("#avatarWrap")).not.toHaveAttribute(
    "data-avatar-reaction",
    lowerReaction,
    { timeout: 8000 }
  );

  // Unequip the same slot → brief curious reaction, never negative.
  await page.locator(`.unequip-btn[data-slot="${lowerItemSlot}"]`).click();

  await expect(page.locator("#avatarWrap")).toHaveAttribute(
    "data-avatar-reaction",
    "unequip"
  );
  await expect(page.locator("#avatar-preview .avatar-expr-overlay")).toHaveAttribute(
    "src",
    /expr-curious\.svg/
  );
});

test("5. Legendary equip triggers the critical reaction path", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await openAvatarPage(page);

  await page.locator(`.equip-btn[data-item-id="${legendaryItemId}"]`).click();

  // Legendary reaction state (3s critical hold).
  await expect(page.locator("#avatarWrap")).toHaveAttribute(
    "data-avatar-reaction",
    "equip-legendary"
  );
  // Proud-critical expression.
  await expect(page.locator("#avatar-preview .avatar-expr-overlay")).toHaveAttribute(
    "src",
    /expr-proud\.svg/
  );
  // Existing aura flare path: wrap carries legendary as highest equipped rarity.
  await expect(page.locator("#avatarWrap")).toHaveAttribute(
    "data-highest-rarity",
    "legendary"
  );
});

// ── Reduced motion ────────────────────────────────────────────────────────────
// Note: test.use({ reducedMotion: "reduce" }) is not honored in this harness
// (verified: matchMedia stays false on every page). page.emulateMedia() works
// and is applied before any navigation, so the avatar page scripts see it.

test.describe("reduced motion", () => {
  test("6. Reduced motion disables animation but preserves avatar state", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "UI dedup");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await loginAsStudent(page);
    await openAvatarPage(page);

    // Blink layer is never built under reduced motion.
    await expect(page.locator("#avatar-blink-layer")).toHaveCount(0);

    // Expression overlay still mounts — expressions swap instantly instead of fading.
    await expect(page.locator("#avatar-preview .avatar-expr-overlay")).toBeAttached();

    // Breathing animation is disabled by the media query.
    const animationName = await page
      .locator("#avatarWrap")
      .evaluate((el: Element) => getComputedStyle(el).animationName);
    expect(animationName).toBe("none");

    // Equip still works and reaction state is preserved (usability intact).
    await page.locator(`.equip-btn[data-item-id="${lowerItemId}"]`).click();

    await expect(page.locator("#avatarWrap")).toHaveAttribute(
      "data-avatar-reaction",
      lowerReaction
    );
    // The slot is actually equipped — unequip button appears for that slot.
    await expect(page.locator(`.unequip-btn[data-slot="${lowerItemSlot}"]`)).toBeVisible();
  });
});
