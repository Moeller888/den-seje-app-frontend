
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS current_band SMALLINT
  CHECK (current_band IS NULL OR (current_band >= 1 AND current_band <= 5));

COMMENT ON COLUMN public.profiles.current_band IS
  'Adaptive band earned across sessions (1-5). Updated every 10 questions. '
  'Takes priority over placement_band at session start. NULL = no sessions completed yet.';
;
