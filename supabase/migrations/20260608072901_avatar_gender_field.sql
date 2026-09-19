ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_gender TEXT NOT NULL DEFAULT 'neutral'
    CHECK (avatar_gender IN ('boy', 'girl', 'neutral'));;
