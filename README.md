# Binat Hatahara

Binat Hatahara is an open-source, privacy-first taharah calendar app built with Next.js and Supabase.

The public app runs at `/`. It lets users enter and calculate period-related dates in the browser, while an owner-only admin panel at `/admin` manages the published configuration used by the hosted app.

Tahara-hosted app: https://binat-hatahara-tahara.vercel.app

Custom domain note: `https://tahara.binah-ai.com` currently remains attached to the
original Vercel domain owner because `binah-ai.com` also serves other personal apps.

This app is intended as a private planning and reminder tool. It is not a substitute for personal halachic guidance.

## Privacy Model

User entries are stored only in the user's browser with `localStorage`.

The public app does not send period entries, preferences, reminder settings, estimated-date settings, or calendar history to Supabase. Supabase stores only app configuration and admin publishing metadata for the hosted deployment:

- `tahara_admin_users`
- `tahara_config_drafts`
- `tahara_config_versions`
- `tahara_audit_events`

Local browser storage keys used by the public app:

- `period_entries`
- `user_preferences`
- `active_config_version`
- `local_reminders_sent`

Self-hosters should create their own Supabase project and use their own environment variables. Do not reuse the hosted app's Supabase project for an independent deployment.

## Features

- Public taharah calendar app
- Local-only user period entries
- Hebrew calendar calculations
- Timezone-safe date-only storage
- Optional local reminders
- Optional future estimated dates, clearly marked as estimated
- Owner admin panel
- Supabase Auth magic-link owner login
- Draft, publish, version, and rollback flow for app configuration

## Estimated Future Dates

Users can opt in to future estimated dates from Settings and choose 1 to 6 months.

Estimated dates are shown in a separate section after the confirmed/current calculations. They are marked `Estimated` / `משוער` and are not used for reminders.

The estimate model is intentionally conservative:

- The future cycle length uses the median interval between saved period entries.
- Estimated Yom HaChodesh uses the median Hebrew day from the last 3 real entries.
- Estimated entries cannot establish a fixed veset pattern.
- The estimate window starts after the current confirmed calculated dates.
- After the next real period is entered, future estimates are recalculated.

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

3. Fill in:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   NEXT_PUBLIC_ADMIN_EMAIL=
   ```

4. Apply the Supabase migrations for the taharah configuration tables.

   ```text
   supabase/migrations
   ```

   Self-hosted deployments should run these migrations against their own Supabase project.

5. Bootstrap the owner email in Supabase SQL:

   ```sql
   insert into public.tahara_admin_users (email, is_owner)
   values ('you@example.com', true)
   on conflict (email) do update set is_owner = true;
   ```

6. Start the app:

   ```bash
   npm run dev
   ```

## Admin Flow

1. Visit `/admin/login`.
2. Sign in with the configured owner email.
3. Edit draft configuration from `/admin`.
4. Save the draft.
5. Publish when ready.
6. Public users receive the active published config from `/api/config/active`.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## License

MIT

## Project Notes

See [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md) for architecture, privacy assumptions, deployment notes, and recent implementation decisions.
