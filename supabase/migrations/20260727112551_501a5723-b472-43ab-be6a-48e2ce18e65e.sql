
CREATE TABLE public.blocked_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_hash text,
  email_hash text,
  email_domain text,
  reason text NOT NULL,
  window_label text,
  max_allowed integer,
  retry_after_sec integer,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX blocked_submissions_created_at_idx ON public.blocked_submissions (created_at DESC);
CREATE INDEX blocked_submissions_ip_hash_idx ON public.blocked_submissions (ip_hash);
CREATE INDEX blocked_submissions_email_hash_idx ON public.blocked_submissions (email_hash);
CREATE INDEX blocked_submissions_reason_idx ON public.blocked_submissions (reason);

GRANT SELECT ON public.blocked_submissions TO authenticated;
GRANT ALL ON public.blocked_submissions TO service_role;

ALTER TABLE public.blocked_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read blocked submissions"
  ON public.blocked_submissions
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
