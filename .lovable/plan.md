Implement a creator-account system so each booking can be linked to a signed-in user, and their avatar appears in the admin notification dropdown.

### Database changes

- Create a `public.profiles` table:
  - `id` uuid primary key, `user_id` uuid references auth.users(id) on delete cascade, `avatar_url` text, `display_name` text, `created_at`, `updated_at`.
  - GRANT SELECT, INSERT, UPDATE, DELETE to authenticated; GRANT ALL to service_role.
  - Enable RLS and add policies: users can read/update their own profile; service_role can manage all.
- Create a trigger/function that auto-inserts a `profiles` row on `auth.users` insert.
- Alter `public.bookings`:
  - Add nullable `user_id` uuid references auth.users(id) on delete set null.
  - Update the INSERT policy to also allow authenticated users to insert with their own `user_id`.
- Update the `log_booking_event` trigger path so it works for both anonymous and authenticated inserts.

### Auth configuration

- Configure email/password authentication.
- Configure Google sign-in via Lovable Cloud managed OAuth.
- Add Google sign-in button to the existing `/auth` page, using `lovable.auth.signInWithOAuth` with `redirect_uri: window.location.origin`.
- Wire `onAuthStateChange` in `src/routes/__root.tsx` to invalidate router on sign-in/sign-out and keep session state fresh.

### Booking modal

- Fetch the current Supabase session when the modal opens.
- If signed in, show a small "Booking as [name]" badge with avatar and a sign-out link.
- If anonymous, keep the existing flow and add a soft CTA to sign in (optional).
- On submit, include the current `user_id` in the insert if a session exists.
- If signed in via Google, ensure `avatar_url` is synced to the `profiles` row (or at least stored at profile creation).

### Admin notifications dropdown

- Update the bookings query in the admin dashboard to join with `profiles` to fetch `avatar_url` and `display_name` for each booking's `user_id`.
- Render the creator's avatar in each notification row.
- If no avatar exists, fall back to a generated-initials avatar (e.g., first letter of name/brand on a colored circular background).
- Anonymous bookings still show initials instead of a real avatar.

### Files touched

- `src/routes/__root.tsx` — auth state listener
- `src/routes/auth.tsx` — Google sign-in button, profile-aware copy
- `src/components/booking-modal.tsx` — session-aware submission + badge
- `src/routes/_authenticated/admin.tsx` — join profiles, render avatars

### Migration required

A single Supabase migration covering the `profiles` table, trigger, `bookings.user_id`, and RLS updates will be created for approval.
