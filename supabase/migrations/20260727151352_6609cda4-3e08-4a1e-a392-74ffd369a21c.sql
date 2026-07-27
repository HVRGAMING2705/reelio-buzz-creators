
-- 1. Revoke EXECUTE on SECURITY DEFINER trigger/helper functions from public roles
REVOKE EXECUTE ON FUNCTION public.grant_first_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_booking_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_booking_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
-- has_role is used in RLS policies; keep it callable by authenticated but revoke from anon/public
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- 2. Fix always-true RLS on bookings INSERT
DROP POLICY IF EXISTS "Anyone can submit booking" ON public.bookings;
CREATE POLICY "Guests can submit bookings without user_id"
  ON public.bookings FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

-- 3. Add self-read policy for bookings
CREATE POLICY "Users can read their own bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 4. Restrict app_settings SELECT to authenticated users only
DROP POLICY IF EXISTS "Anyone can read app settings" ON public.app_settings;
CREATE POLICY "Authenticated users can read app settings"
  ON public.app_settings FOR SELECT TO authenticated
  USING (true);
REVOKE SELECT ON public.app_settings FROM anon;
