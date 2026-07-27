ALTER TABLE public.spam_attempts
  ADD COLUMN IF NOT EXISTS referrer TEXT,
  ADD COLUMN IF NOT EXISTS page_url TEXT;