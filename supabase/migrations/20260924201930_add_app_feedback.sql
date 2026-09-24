CREATE TABLE public.app_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('problem', 'suggestion', 'rating')),
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 2000),
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  screen text NOT NULL CHECK (screen IN ('home', 'list')),
  role text CHECK (role IN ('driver', 'passenger')),
  page_url text NOT NULL CHECK (char_length(page_url) <= 500),
  user_agent text NOT NULL CHECK (char_length(user_agent) <= 500),
  app_version text NOT NULL CHECK (char_length(app_version) <= 50),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'fixed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_feedback_fields CHECK (
    (category = 'rating' AND rating IS NOT NULL)
    OR (category IN ('problem', 'suggestion') AND rating IS NULL AND char_length(btrim(message)) > 0)
  )
);

CREATE INDEX app_feedback_status_created_idx ON public.app_feedback (status, created_at DESC);
ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_feedback FROM anon, authenticated;
GRANT INSERT (category, message, rating, screen, role, page_url, user_agent, app_version)
  ON public.app_feedback TO authenticated;
GRANT SELECT ON public.app_feedback TO authenticated;
GRANT UPDATE (status) ON public.app_feedback TO authenticated;

CREATE POLICY app_feedback_insert_own ON public.app_feedback FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

-- get_my_profile_flags() is an existing, scoped check of the caller's profile.
CREATE POLICY app_feedback_admin_read ON public.app_feedback FOR SELECT TO authenticated
USING (COALESCE((SELECT is_admin FROM public.get_my_profile_flags() LIMIT 1), false));

CREATE POLICY app_feedback_admin_status ON public.app_feedback FOR UPDATE TO authenticated
USING (COALESCE((SELECT is_admin FROM public.get_my_profile_flags() LIMIT 1), false))
WITH CHECK (COALESCE((SELECT is_admin FROM public.get_my_profile_flags() LIMIT 1), false));
