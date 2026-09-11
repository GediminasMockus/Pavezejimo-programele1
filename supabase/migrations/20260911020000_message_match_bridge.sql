/*
  Canonical conversation identity: every request-backed message is linked to
  its match. Keep request_id for backwards compatibility during the client
  migration, but make match_id the preferred key for new reads/writes.
*/

UPDATE public.messages m
SET match_id = r.match_id
FROM public.ride_requests rr
JOIN public.matches r ON r.request_id = rr.id
WHERE m.request_id = rr.id
  AND m.match_id IS NULL;

CREATE OR REPLACE FUNCTION public.sync_message_match_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.match_id IS NULL AND NEW.request_id IS NOT NULL THEN
    SELECT id INTO NEW.match_id
    FROM public.matches
    WHERE request_id = NEW.request_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_message_match_id ON public.messages;
CREATE TRIGGER trg_sync_message_match_id
BEFORE INSERT OR UPDATE OF request_id, match_id
ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.sync_message_match_id();
