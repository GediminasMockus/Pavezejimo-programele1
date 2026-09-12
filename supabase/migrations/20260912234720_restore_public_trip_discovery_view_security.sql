-- The discovery view must bypass base-table RLS while exposing only its sanitized projection.
ALTER VIEW public.public_trips SET (security_invoker = false);
REVOKE ALL ON public.public_trips FROM anon, PUBLIC;
GRANT SELECT ON public.public_trips TO authenticated;
