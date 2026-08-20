UFK WEBSITE — SUPABASE + FIGHTER ACCOUNTS

WHAT IS INCLUDED
- Empty league tables ready for your real UFK data.
- Public Home, Rankings, Betting, Fights and Legacy pages.
- Fighter Account page with email/password signup and sign-in.
- Fighter profile: display name, region, official 0-0-0 fighter creation.
- Fighters cannot edit wins/losses/draws, rankings, titles or ratings.
- Admin dashboard can add/delete fighters, update records, grant/vacate titles,
  publish results, create events, contract activity, betting and featured fights.
- Supabase Auth + Postgres + Row Level Security.

SETUP
1. Create a Supabase project.
2. Open SQL Editor and run ALL of supabase-schema.sql.
   If you already ran the older UFK schema, this v2 file upgrades it.
3. Open Project Settings / API in Supabase.
4. Put your Project URL and anon/publishable key in config.js.
   NEVER put a service_role or secret key in browser code.
5. In Supabase Authentication settings, enable Email provider.
6. Set your Site URL / Redirect URLs to your deployed website address.
7. Deploy the folder to Vercel, Netlify, GitHub Pages or another static host.

FIRST ADMIN
Create an account normally through the website (or Supabase Authentication),
then run this once in SQL Editor, replacing the email:

update public.profiles p
set is_admin = true
from auth.users u
where p.id = u.id and u.email = 'YOUR-ADMIN-EMAIL@example.com';

FIGHTER FLOW
1. Fighter opens Fighter Account.
2. Creates an account with fighter name, region, email and password.
3. If email confirmation is enabled, they confirm the email.
4. They sign in and click CREATE MY FIGHTER PROFILE.
5. Their official fighter row starts at 0-0-0.
6. Admins control the official record, championship status and ratings.

SECURITY
- Fighter accounts can update only display_name, region and updated_at on their own profile.
- A fighter can create only a fighter row tied to their own auth user and only with a clean 0-0-0 / zero-rating record.
- No fighter policy allows direct record/rating/title changes.
- Admin actions are protected by RLS using public.is_ufk_admin().
- Keep the service-role key server-side only; do not add it to config.js.

NOTE
This is a static frontend talking directly to Supabase. For payments, real-money betting,
private moderation actions, file uploads, or other sensitive server-side operations, add a
trusted backend / Supabase Edge Functions rather than exposing privileged keys in the browser.
