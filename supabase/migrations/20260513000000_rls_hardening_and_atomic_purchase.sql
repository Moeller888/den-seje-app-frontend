-- ============================================================
-- Security hardening: Enable RLS on profiles, user_items,
-- shop_items and add minimal required policies.
-- Also adds purchase_item atomic RPC to fix the buy-item
-- TOCTOU race condition (READ coins → compute → SET).
-- ============================================================

-- ── 1. PROFILES ─────────────────────────────────────────────
-- Before: RLS disabled → any authenticated user could
-- UPDATE profiles SET role = 'super_admin' WHERE id = auth.uid()

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Own profile: all roles need this for auth checks (login, app.js).
-- Student profiles: teachers need to read student emails via the
-- teacher_student_overview view and PostgREST foreign-key joins.
CREATE POLICY "profiles_select"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR role = 'student');

-- All profile mutations go through SECURITY DEFINER RPCs:
--   equip_item (active_avatar), create-student, create-teacher.
-- No direct INSERT/UPDATE/DELETE policies.

-- ── 2. USER_ITEMS ────────────────────────────────────────────
-- Before: RLS disabled → any authenticated user could INSERT
-- INTO user_items (user_id, item_id) to give themselves free items.

ALTER TABLE public.user_items ENABLE ROW LEVEL SECURITY;

-- Users may read their own inventory (shop.html, avatar.html).
CREATE POLICY "user_items_select_own"
  ON public.user_items
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No direct INSERT/DELETE: purchases go through purchase_item
-- SECURITY DEFINER RPC below.

-- ── 3. SHOP_ITEMS ────────────────────────────────────────────
-- Before: RLS disabled → any authenticated user could INSERT,
-- UPDATE, or DELETE shop catalog rows.

ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;

-- Everyone (including anonymous) may browse the shop.
CREATE POLICY "shop_items_select_all"
  ON public.shop_items
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE: catalog changes require DB-level access.

-- ── 4. ATOMIC purchase_item RPC ──────────────────────────────
-- Replaces the 5-step race-prone buy-item logic:
--   1. READ coins
--   2. Compute newCoins
--   3. CHECK if owned (race window here)
--   4. SET coins = newCoins  ← not atomic
--   5. INSERT user_items
--   6. Manual "rollback" on step 5 failure (not a real transaction)
--
-- This single SECURITY DEFINER function runs in one transaction:
--   - Uses auth.uid() internally (caller cannot spoof user_id)
--   - Atomic decrement: WHERE coins >= v_price prevents overdraft
--     and is the race-condition fence — only one concurrent caller
--     wins the UPDATE; the other finds no row to update
--   - INSERT into user_items happens in the same transaction

CREATE OR REPLACE FUNCTION public.purchase_item(p_item_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID    := auth.uid();
  v_price     INTEGER;
  v_remaining INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Verify item exists and get price.
  SELECT price INTO v_price
  FROM public.shop_items
  WHERE id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_not_found';
  END IF;

  -- Verify not already owned.
  IF EXISTS (
    SELECT 1 FROM public.user_items
    WHERE user_id = v_user_id AND item_id = p_item_id
  ) THEN
    RAISE EXCEPTION 'already_owned';
  END IF;

  -- Atomic decrement: WHERE coins >= v_price is the overdraft guard.
  -- If the student has insufficient coins OR no student_progress row,
  -- no row is updated and RETURNING INTO leaves v_remaining as NULL.
  UPDATE public.student_progress
  SET coins = coins - v_price
  WHERE student_id = v_user_id
    AND coins >= v_price
  RETURNING coins INTO v_remaining;

  IF v_remaining IS NULL THEN
    RAISE EXCEPTION 'insufficient_coins';
  END IF;

  -- Insert ownership record in the same transaction.
  INSERT INTO public.user_items (user_id, item_id)
  VALUES (v_user_id, p_item_id);

  RETURN json_build_object('remaining_coins', v_remaining);
END;
$$;
