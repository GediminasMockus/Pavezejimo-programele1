-- Track reminder emails so a user is not emailed repeatedly.
CREATE TABLE IF NOT EXISTS public.notification_email_reminders (
  user_id text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_email_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_email_reminders FROM PUBLIC, anon, authenticated;
