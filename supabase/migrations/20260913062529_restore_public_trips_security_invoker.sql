-- Keep public trip discovery subject to the querying user's permissions and RLS.
ALTER VIEW public.public_trips SET (security_invoker = true);
