
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS placement_band SMALLINT
  CHECK (placement_band IS NULL OR (placement_band >= 1 AND placement_band <= 4));

COMMENT ON COLUMN public.profiles.placement_band IS
  'Assessed starting difficulty band (1-4) from placement assessment. NULL = not yet completed.';
;
