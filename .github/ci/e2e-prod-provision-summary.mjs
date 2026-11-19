// M1 (C2): what the approver of an e2e-prod-provision.yml run is about to approve.
//
// Runs in the job `describe`, which has NO environment, NO secrets and makes NO network call, BEFORE the job
// `provision` asks for the e2e-prod approval. Its job summary (GITHUB_STEP_SUMMARY) is shown on the run page
// while `provision` waits in "Review deployments", so the approver sees — in fixed texts — the purpose, the
// mode, the slot, the branch, the full commit SHA and the expected effect.
//
// Fail-closed, in addition to (never instead of) the checks in tools/e2e/provision-accounts.mjs: an invalid
// combination makes `describe` fail, and `provision` (needs: describe) then never asks for approval at all:
//   - mode is not exactly dry-run or apply, or slot is not exactly 0..3;
//   - the ref is not refs/heads/main, or the SHA is not a full 40-character commit SHA;
//   - apply without confirm = provision-accounts-slot-<slot> for exactly this slot;
//   - dry-run with a non-empty confirm (the operator has mixed up the two procedures).
//
// The confirm value is NEVER printed, only "matcher"/"mangler"/"forkert". The input values that are printed
// (mode, slot) are only printed after they have been validated against fixed lists.
// Plain ESM: only Node built-ins, no dependencies (the job's sparse checkout is this one file).
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MODES = Object.freeze(["dry-run", "apply"]);
export const SLOTS = Object.freeze(["0", "1", "2", "3"]);
export const MAIN_REF = "refs/heads/main";
export const confirmationFor = (slot) => `provision-accounts-slot-${slot}`;

const SHA_RE = /^[0-9a-f]{40}$/;

export function describeDispatch(env) {
  const source = env && typeof env === "object" ? env : {};
  const mode = typeof source.PROVISION_MODE === "string" ? source.PROVISION_MODE : "";
  const slot = typeof source.E2E_SLOT === "string" ? source.E2E_SLOT : "";
  const confirm = typeof source.PROVISION_CONFIRM === "string" ? source.PROVISION_CONFIRM : "";
  const ref = typeof source.GITHUB_REF === "string" ? source.GITHUB_REF : "";
  const sha = typeof source.GITHUB_SHA === "string" ? source.GITHUB_SHA : "";
  const problems = [];

  const modeOk = MODES.includes(mode);
  const slotOk = SLOTS.includes(slot);
  if (!modeOk) problems.push("mode er hverken dry-run eller apply");
  if (!slotOk) problems.push("slot er ikke 0, 1, 2 eller 3");
  if (ref !== MAIN_REF) problems.push("kørslen er ikke startet fra branchen main");
  if (!SHA_RE.test(sha)) problems.push("commit-SHA mangler eller er ugyldig");

  let confirmText = "tom";
  if (modeOk && slotOk && mode === "apply") {
    if (confirm === "") { confirmText = "mangler"; problems.push(`apply kræver bekræftelsen ${confirmationFor(slot)}`); }
    else if (confirm !== confirmationFor(slot)) { confirmText = "forkert"; problems.push(`bekræftelsen matcher ikke ${confirmationFor(slot)}`); }
    else confirmText = "matcher";
  } else if (modeOk && mode === "dry-run" && confirm !== "") {
    confirmText = "udfyldt";
    problems.push("dry-run skal have tom bekræftelse");
  }

  const shownMode = modeOk ? mode : "UGYLDIG";
  const shownSlot = slotOk ? slot : "UGYLDIG";
  const effect = !modeOk ? "ingen (kørslen stoppes)"
    : mode === "dry-run" ? "kun læsning — ingen konti eller profiler oprettes"
    : `opretter højst de fire markerede E2E-konti og deres profiler for slot ${shownSlot} — intet slettes eller ændres`;

  const lines = [
    "## E2E-provisionering — det, godkendelsen gælder",
    "",
    "| | |",
    "|---|---|",
    "| Formål | oprette eller kontrollere de fire markerede E2E-testkonti (A4) |",
    `| Mode | ${shownMode} |`,
    `| Slot | ${shownSlot} |`,
    `| Branch | ${ref === MAIN_REF ? "main" : "IKKE main"} |`,
    `| Commit | ${SHA_RE.test(sha) ? sha : "UGYLDIG"} |`,
    `| Bekræftelse | ${confirmText} |`,
    `| Forventet virkning | ${effect} |`,
    "",
    problems.length === 0
      ? "Jobbet `provision` kræver nu en særskilt godkendelse i environmentet `e2e-prod`. Godkend kun, hvis mode, slot og commit ovenfor er præcis dem, der er givet GO til (docs/operations/e2e-prod-provisioning.md, afsnit 5)."
      : "**Stoppet:** jobbet `provision` starter ikke, og der bedes ikke om godkendelse.",
  ];
  for (const p of problems) lines.push(`- ${p}`);
  return { ok: problems.length === 0, lines, problems };
}

export function main(env = process.env) {
  const { ok, lines, problems } = describeDispatch(env);
  for (const l of lines) console.log(l);
  if (typeof env.GITHUB_STEP_SUMMARY === "string" && env.GITHUB_STEP_SUMMARY !== "") {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  }
  for (const p of problems) console.log(`::error::e2e-prod-provision: ${p}`);
  return ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
