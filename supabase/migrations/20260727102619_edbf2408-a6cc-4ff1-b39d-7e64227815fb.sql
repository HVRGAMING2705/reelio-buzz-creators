
CREATE TABLE public.booking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_value text,
  to_value text,
  note text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_events_booking_id_idx ON public.booking_events(booking_id, created_at DESC);

GRANT SELECT, INSERT ON public.booking_events TO authenticated;
GRANT ALL ON public.booking_events TO service_role;

ALTER TABLE public.booking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read booking events" ON public.booking_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert booking events" ON public.booking_events
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_booking_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.booking_events(booking_id, event_type, to_value, actor_id)
    VALUES (NEW.id, 'created', NEW.status, auth.uid());
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.booking_events(booking_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.id, 'status_changed', OLD.status, NEW.status, auth.uid());
    END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      INSERT INTO public.booking_events(booking_id, event_type, from_value, to_value, actor_id, note)
      VALUES (NEW.id, 'note_updated', OLD.notes, NEW.notes, auth.uid(), NEW.notes);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_booking_event() FROM PUBLIC;

CREATE TRIGGER booking_events_insert
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.log_booking_event();

CREATE TRIGGER booking_events_update
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.log_booking_event();
