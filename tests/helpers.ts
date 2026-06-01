/**
 * Section 97 — Shared test utilities for teacher-facing tests.
 * Import these helpers in any spec that needs teacher authentication.
 */
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const PROD = "https://den-seje-app-frontend.vercel.app";

export const TEACHER_EMAIL    = process.env.TEST_TEACHER_EMAIL    ?? "teacher-test@hotmail.com";
export const TEACHER_PASSWORD = process.env.TEST_TEACHER_PASSWORD ?? "TestTeacher2026!";
export const STUDENT2_EMAIL   = process.env.TEST_STUDENT2_EMAIL   ?? "student-teacher-test@hotmail.com";

/**
 * Log in as the test teacher and wait for teacher.html to load.
 */
export async function loginAsTeacher(page: any): Promise<void> {
  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", TEACHER_EMAIL);
  await page.fill("#password", TEACHER_PASSWORD);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/teacher.html`, { timeout: 20000 });
  // Wait for class overview to load (get_teacher_visibility RPC)
  await page.waitForFunction(
    () => {
      const el = document.getElementById("classOverview");
      return el && el.textContent && el.textContent.trim() !== "Indlæser...";
    },
    { timeout: 15000 }
  );
}

/**
 * Navigate directly to a student's detail page as teacher and wait for
 * the domain editor grid to be present.
 */
export async function openStudentDetail(page: any, studentId: string): Promise<void> {
  await page.goto(
    `${PROD}/student-detail.html?id=${studentId}`,
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForSelector("#sd-domain-grid", { timeout: 20000 });
}
