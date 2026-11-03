# Intent: sign-in, search and a user menu

## Problem

Accountable runs on one computer for one person. A team can't share it, nobody signs in, and there's no quick way to find a record.

## Proposed outcome

A small team shares one Accountable on the web. Everyone signs in and works on the same organizations, contacts and deals, and each record shows who added it. A search box in the top bar finds any organization, contact or deal. A menu under your initials holds the theme, light, dark or system, and signing out.

## Constraints

- The data lives in Postgres on Supabase, still through SQLAlchemy Core. The tests keep their own SQLite databases.
- Sign-in uses Supabase Auth with an email and password. The browser holds only the publishable key. The backend checks the token on every request and takes the user from it, never from the request.
- There's no sign-up page. People are added in Supabase's dashboard.
- The settings live in .env as DATABASE_URL, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.
- Each organization, contact, deal and activity records who added it and who last changed it.
- The end-to-end tests and ui-check sign in without anyone's real password and never touch Supabase. CI needs no secrets.
- Search ignores case and works the same on SQLite and Postgres.
- The theme moves from the dark mode button into the menu. System follows the device's setting.
- The shared app now needs an internet connection, for Supabase. `npm run dev` and the tests still run without one.
- The app deploys to Render's free plan as one web service: FastAPI serves the built frontend and the API, migrations run when it starts, and it answers at its onrender.com address. A render.yaml describes it, with the Supabase settings entered in Render, not written in the file.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Decisions

- **Names:** a person's name is the display name in their Supabase profile, set when they're added, and falls back to their email. The menu's initials come from the name, or from the email's first letter if there's no name.
- **Two ways to run:** `npm run dev` runs on this computer against the local SQLite file, with the sample data and a few made-up teammates to sign in as. It needs no Supabase and no internet. A new `npm start` runs the built app the way Render does, against Supabase. `npm run seed` and `npm run empty` only ever touch the local file, so they can't wipe the team's data. ui-check checks the app that `npm run dev` starts.
- **Today:** the team shares one time zone, set in render.yaml, and the backend's today is the date in that zone. Without the setting, it's the computer's own date, as now. Render's servers run on UTC, so without this a deal won in the evening in the Americas would get tomorrow's close date.

## Not in this change

- Roles and permissions: everyone can do everything.
- Moving the data in the local SQLite file to Supabase. Supabase starts with the sample data.
- Signing in with Google, magic links or a password reset.

## Success criteria

1. npm run check passes and never touches Supabase, with or without the settings in .env.
2. Signed out, every page shows the sign-in screen and every API route refuses. Signed in, everything works as before.
3. Every record and activity shows who added it.
4. Search finds an organization, a contact and a deal by part of a name, in any case.
5. The menu's theme choice is remembered, and System follows the device's setting.
6. The built app runs on this computer the way Render runs it, signed in against Supabase.
