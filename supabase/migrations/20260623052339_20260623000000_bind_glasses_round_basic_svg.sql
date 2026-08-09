UPDATE public.shop_items
SET image_url = '/assets/avatar/glasses/glasses-round-basic-v1.svg'
WHERE id = 'glasses-round'
  AND image_url IS DISTINCT FROM '/assets/avatar/glasses/glasses-round-basic-v1.svg';;
