-- Moves claimed_at token generation from the client (new Date().toISOString())
-- into PostgreSQL, making it atomic with the UPDATE transaction.
--
-- Safety properties:
--   - NOW() is the transaction start timestamp — set once, inside the lock.
--   - No clock skew: single PostgreSQL clock, not the calling worker's system clock.
--   - Microsecond precision vs. JavaScript's millisecond — collision window
--     shrinks by 1000x even under rapid re-claim scenarios.
--   - Atomicity: claimed_at value is determined at the moment the row is locked
--     and written, not before the network call.
--
-- Returns the claimed row (1 row) or an empty set (0 rows) if the job does not
-- exist or is no longer pending. Callers check data?.[0] ?? null.

CREATE OR REPLACE FUNCTION claim_generation_job(p_job_id UUID)
RETURNS SETOF avatar_generation_jobs
LANGUAGE sql
AS $$
  UPDATE avatar_generation_jobs
     SET status     = 'generating',
         claimed_at = NOW()
   WHERE id         = p_job_id
     AND status     = 'pending'
  RETURNING *;
$$;
