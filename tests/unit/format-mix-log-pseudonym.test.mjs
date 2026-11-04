// The pupil pseudonym in the FORMAT_MIX log lines (supabase/functions/get-next-question/log-pseudonym.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pupilLogHash, PUPIL_LOG_HASH_PREFIX, PUPIL_LOG_HASH_HEX_LENGTH } from "../../supabase/functions/get-next-question/log-pseudonym.ts";

const A = "9e540ffa-0000-4000-8000-000000000001";
const B = "eec64724-0000-4000-8000-000000000002";

test("pseudonym = first 16 hex of SHA-256(prefix + id): stable, per pupil, reproducible by the evaluation", async () => {
  const expected = createHash("sha256").update(PUPIL_LOG_HASH_PREFIX + A, "utf8").digest("hex").slice(0, 16);
  assert.equal(await pupilLogHash(A), expected);
  assert.equal(await pupilLogHash(A), await pupilLogHash(A));
  assert.notEqual(await pupilLogHash(A), await pupilLogHash(B));
  assert.match(await pupilLogHash(A), /^[0-9a-f]{16}$/);
  assert.equal(PUPIL_LOG_HASH_HEX_LENGTH, 16);
});

test("the pseudonym never contains the id or a bare hash of it", async () => {
  const h = await pupilLogHash(A);
  for (const part of A.split("-")) assert.equal(h.includes(part), false, part);
  assert.notEqual(h, createHash("sha256").update(A, "utf8").digest("hex").slice(0, 16), "domain-separated by the prefix");
});

test("no id, no pseudonym", async () => {
  for (const bad of ["", null, undefined, 42]) await assert.rejects(() => pupilLogHash(bad), /student id required/);
});
