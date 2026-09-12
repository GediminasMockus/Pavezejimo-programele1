CREATE INDEX IF NOT EXISTS idx_notifications_related_request_id
  ON public.notifications (related_request_id);

CREATE INDEX IF NOT EXISTS idx_notifications_related_trip_id
  ON public.notifications (related_trip_id);

CREATE INDEX IF NOT EXISTS idx_ratings_trip_id
  ON public.ratings (trip_id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id
  ON public.user_profiles (user_id);
