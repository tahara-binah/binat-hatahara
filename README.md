# Binat Hatahara

Binat Hatahara is a privacy-first taharah calendar app built with Next.js and Supabase.

The public app runs at `/`. It lets users enter and calculate period-related dates in the browser, while an owner-only admin panel at `/admin` manages the published configuration used by the app.

## Privacy Model

User entries are stored only in the user's browser with `localStorage`.

The public app does not send period entries, preferences, or calendar history to Supabase. Supabase stores only app configuration and admin publishing metadata:

- `admin_users`
- `config_drafts`
- `config_versions`
- `audit_events`

Local browser storage keys used by the public app:

- `period_entries`
- `user_preferences`
- `active_config_version`

## Features

- Public taharah calendar app
- Local-only user period entries
- Hebrew calendar calculations
- Timezone-safe date-only storage
- Owner admin panel
- Supabase Auth magic-link owner login
- Draft, publish, version, and rollback flow for app configuration

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

4. Run the Supabase migration in `supabase/migrations/0001_initial.sql`.

5. Bootstrap the owner email in Supabase SQL:

   ```sql
   insert into public.admin_users (email, is_owner)
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
