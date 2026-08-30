-- Add notifications system for confirmed trips
-- This will notify both passenger and driver when a ride request is accepted

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  type text NOT NULL, -- 'request_accepted', 'request_rejected', 'trip_reminder', 'new_message'
  title text NOT NULL,
  message text NOT NULL,
  related_trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE,
  related_request_id uuid REFERENCES public.ride_requests(id) ON DELETE CASCADE,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "select_own_notifications" ON notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

CREATE POLICY "insert_system_notifications" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "update_own_notifications" ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- Function to create notification when ride request is accepted
CREATE OR REPLACE FUNCTION notify_on_request_accepted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Notify passenger when driver accepts their request
  IF NEW.status = 'accepted' AND OLD.status = 'pending' AND NEW.request_type = 'passenger_request' THEN
    INSERT INTO notifications (user_id, type, title, message, related_trip_id, related_request_id)
    VALUES (
      NEW.passenger_id,
      'request_accepted',
      'Kelionė patvirtinta!',
      'Vairuotojas patvirtino jūsų užklausą. Galite susisiekti su vairuotoju per pokalbį.',
      NEW.trip_id,
      NEW.id
    );
  END IF;

  -- Notify driver when passenger accepts their offer
  IF NEW.status = 'accepted' AND OLD.status = 'pending' AND NEW.request_type = 'driver_offer' THEN
    INSERT INTO notifications (user_id, type, title, message, related_trip_id, related_request_id)
    VALUES (
      NEW.driver_id,
      'request_accepted',
      'Pasiūlymas priimtas!',
      'Keleivis priėmė jūsų pasiūlymą. Galite susisiekti su keleiviu per pokalbį.',
      NEW.trip_id,
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS on_ride_request_status_change ON public.ride_requests;
CREATE TRIGGER on_ride_request_status_change
  AFTER UPDATE OF status ON public.ride_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_request_accepted();

-- Function to mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE notifications
  SET read = true
  WHERE id = p_notification_id AND user_id = auth.uid()::text;
  RETURN FOUND;
END;
$$;
GRANT EXECUTE ON FUNCTION mark_notification_read(uuid) TO authenticated;

-- Function to mark all notifications as read for user
CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE notifications
  SET read = true
  WHERE user_id = auth.uid()::text AND read = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION mark_all_notifications_read() TO authenticated;
