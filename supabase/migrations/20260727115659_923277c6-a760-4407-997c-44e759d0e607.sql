CREATE TABLE public.spam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason text NOT NULL DEFAULT 'honeypot',
  ip_hash text,
  email_hash text,
  email_domain text,
  attempted_email text,
  user_agent text,
  form text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.spam_attempts TO authenticated;
GRANT ALL ON public.spam_attempts TO service_role;

ALTER TABLE public.spam_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read spam attempts"
  ON public.spam_attempts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX spam_attempts_created_at_idx ON public.spam_attempts (created_at DESC);
CREATE INDEX spam_attempts_ip_hash_idx ON public.spam_attempts (ip_hash);
CREATE INDEX spam_attempts_email_hash_idx ON public.spam_attempts (email_hash);