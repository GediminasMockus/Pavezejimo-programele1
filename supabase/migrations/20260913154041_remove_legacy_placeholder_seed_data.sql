-- Remove obsolete placeholder seed rows that cannot belong to a real authenticated user.
DELETE FROM public.trips
WHERE created_by = 'YOUR_USER_ID_HERE'
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id::text = 'YOUR_USER_ID_HERE');

DELETE FROM public.user_profiles
WHERE id = 'YOUR_USER_ID_HERE'
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id::text = 'YOUR_USER_ID_HERE');