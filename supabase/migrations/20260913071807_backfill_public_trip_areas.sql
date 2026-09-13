UPDATE public.trips
SET from_area = CASE
      WHEN from_area IS NOT NULL AND btrim(from_area) <> '' THEN from_area
      WHEN from_location ~ ', [^,]+, [^,]+ miesto savivaldybė' THEN regexp_replace(from_location, '^.*?, ([^,]+), [^,]+ miesto savivaldybė.*$', '\1')
      ELSE btrim(split_part(from_location, ',', 1))
    END,
    to_area = CASE
      WHEN to_area IS NOT NULL AND btrim(to_area) <> '' THEN to_area
      WHEN to_location ~ ', [^,]+, [^,]+ miesto savivaldybė' THEN regexp_replace(to_location, '^.*?, ([^,]+), [^,]+ miesto savivaldybė.*$', '\1')
      ELSE btrim(split_part(to_location, ',', 1))
    END
WHERE (from_area IS NULL OR btrim(from_area) = '' OR to_area IS NULL OR btrim(to_area) = '')
  AND from_location IS NOT NULL
  AND to_location IS NOT NULL;
