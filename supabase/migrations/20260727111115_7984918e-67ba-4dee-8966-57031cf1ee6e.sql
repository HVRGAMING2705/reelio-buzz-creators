
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Extend the existing event logger trigger to also record assignment changes
CREATE OR REPLACE FUNCTION public.log_booking_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.booking_events (booking_id, event_type, to_value, actor_id)
    VALUES (NEW.id, 'created', NEW.status, NEW.user_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.booking_events (booking_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.id, 'status_changed', OLD.status, NEW.status, auth.uid());
    END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      INSERT INTO public.booking_events (booking_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.id, 'note_updated', OLD.notes, NEW.notes, auth.uid());
    END IF;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      INSERT INTO public.booking_events (booking_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.id, 'assigned', COALESCE(OLD.assigned_to::text, ''), COALESCE(NEW.assigned_to::text, ''), auth.uid());
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;
