# Project Summary

## Purpose

Binat Hatahara is an open-source, privacy-first taharah calendar app. The public app helps users record period starts, calculate upcoming veset-related dates, view Hebrew/Gregorian calendars, and optionally use local reminders and estimated future planning dates.

The app is intended as a private planning and reminder tool. It is not a substitute for personal halachic guidance.

## Privacy Model

The public app stores user data only in browser `localStorage`.

Local-only data includes:

- period entries
- preferences
- reminder settings
- future-estimate settings
- reminder sent markers

The public app does not send period entries, preferences, reminders, estimated-date settings, or calendar history to Supabase.

Supabase is used by the hosted app only for app configuration and admin publishing metadata. Self-hosters should create their own Supabase project and provide their own environment variables.

## Repository And Hosting

- GitHub: `https://github.com/tahara-binah/binat-hatahara`
- Tahara Vercel project: `tahara/binat-hatahara`
- Tahara-hosted app: `https://binat-hatahara-tahara.vercel.app`

The custom domain `https://tahara.binah-ai.com` currently remains attached to the
original Vercel domain owner because `binah-ai.com` also serves other personal apps.

## App Structure

Important files:

- `components/public/BinatApp.tsx`: public app UI, local storage, settings, reminders, tabs.
- `lib/veset.ts`: veset calculation logic, fixed-veset detection, future estimates.
- `lib/dates.ts`: date-only and Hebrew calendar helpers.
- `lib/config/*`: published app configuration schema, defaults, and repository access.
- `components/admin/AdminDashboard.tsx`: owner admin UI for config draft/publish/rollback.
- `app/api/config/active/route.ts`: public active-config endpoint.
- `app/api/admin/config/*`: admin config endpoints.

## Current Calculation Notes

Regular calculations use `calculateVesatot` in `lib/veset.ts`.

The app supports:

- Yom HaChodesh
- Haflagah
- Onah Beinonit
- optional Day 31
- optional 24-hour Onah Beinonit
- optional Or Zarua
- optional Chabad/onah-based Haflagah
- fixed-veset detection for real entries

Future estimated dates are opt-in from Settings.

Estimated-date behavior:

- Users can choose 1 to 6 future months.
- The estimate window starts after the latest current confirmed calculation, not after the last entered period.
- Cycle length uses the median interval between saved real entries.
- Estimated Yom HaChodesh uses the median Hebrew day from the last 3 real entries.
- Artificial projected entries cannot establish a fixed veset.
- Estimated items are marked `Estimated` / `משוער`.
- Estimated items are shown separately after the confirmed/current calculation section.
- Estimated items are not used for reminders.

## Verification

Run before committing or deploying:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Recent Decisions

- Public user data remains local-only.
- Future estimates are visually and conceptually separated from confirmed/current calculations.
- Median is preferred over average for projection because one unusual long cycle should not pull all estimates forward.
- Estimate controls are per-device preferences, not admin-managed global config.
