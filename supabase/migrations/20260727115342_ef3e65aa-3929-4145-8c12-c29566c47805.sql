
CREATE TABLE public.captcha_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outcome text NOT NULL,
  reason text,
  ip_hash text,
  email_hash text,
  email_domain text,
  user_agent text,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.captcha_events TO authenticated;
GRANT ALL ON public.captcha_events TO service_role;

ALTER TABLE public.captcha_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read captcha events"
  ON public.captcha_events FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_captcha_events_created_at ON public.captcha_events (created_at DESC);
CREATE INDEX idx_captcha_events_outcome ON public.captcha_events (outcome);
CREATE INDEX idx_captcha_events_email_hash ON public.captcha_events (email_hash);
CREATE INDEX idx_captcha_events_booking_id ON public.captcha_events (booking_id);
