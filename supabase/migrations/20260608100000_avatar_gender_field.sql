-- Section 143: Add avatar_gender field to profiles.
-- Students choose boy / girl / neutral in the avatar customisation page.
-- No RPC needed: the profiles_self_update policy (20260603060000) already
-- allows authenticated users to update their own profile row.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_gender TEXT NOT NULL DEFAULT 'neutral'
    CHECK (avatar_gender IN ('boy', 'girl', 'neutral'));
