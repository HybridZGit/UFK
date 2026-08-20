UCS WEBSITE v4 — SUPABASE + FIGHTER PROFILES + SMART RANKINGS

WHAT CHANGED
- Correct UCS branding across the league site.
- Rankings: UCS WORLD / UCS PS5 / UCS PC / UCS XBOX.
- UFK Fight Kit is shown as the rankings sponsor with an animated background.
- Fighter accounts can upload profile pictures (PNG/JPG/WebP, max 5 MB).
- Profile pictures are stored in Supabase Storage and shown in rankings.
- Click any fighter in Rankings to open a full fighter profile card with record, rating, form, titles, metrics and recent fights.
- Automatic smart ranking model calculates Resume, Momentum, Finishing, Activity, Big Fight and overall Score.
- Publishing a result through Admin automatically updates W/L records and recalculates rankings.
- Admin has a RE-CALCULATE RANKINGS button for manual refreshes.
- Clear League Data now requires typing DELETE UCS DATA.

IMPORTANT UPDATE STEP
1. In Supabase open SQL Editor.
2. Paste/run the ENTIRE new supabase-schema.sql file.
   This adds avatar fields, the public fighter-avatars Storage bucket, secure upload policies,
   UCS title migration, and the new ranking/result functions.
3. Upload/replace all website files in your GitHub repository.
4. Commit the changes and wait for GitHub Pages to redeploy.
5. Hard refresh the live site (Ctrl+F5).

PROFILE PICTURES
Fighters sign in -> Fighter Account -> choose a profile picture -> UPLOAD PFP.
The image is stored under that user's own Supabase Auth folder. Fighters cannot upload into another user's folder.

SMART RANKINGS
The built-in ranking engine is automatic and deterministic. It uses official data (record strength,
recent form, KO wins, activity and championship experience) rather than pretending a browser-side
formula is AI. This makes rankings explainable and prevents a public API key from being exposed.
If you later want a true LLM ranking layer, put it in a Supabase Edge Function with a server-side secret.

FIRST ADMIN (same as before)
Create an account normally, then run once in SQL Editor with your email:

update public.profiles p
set is_admin = true
from auth.users u
where p.id = u.id and u.email = 'YOUR-ADMIN-EMAIL@example.com';

SECURITY
Never place a Supabase service_role key, sb_secret key, OpenAI secret, Discord bot token,
or other private secret inside config.js or GitHub Pages.
