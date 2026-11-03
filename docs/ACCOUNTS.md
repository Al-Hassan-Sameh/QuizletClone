# Accounts and cloud synchronization

Recall works offline as a guest without any configuration. Hosted authentication uses the official Supabase client with PKCE, provider-managed passwords, token refresh, email verification and Google OAuth. This repository includes integration code; it does not provision a project or claim live-provider validation.

## Configure a real installation

1. Create a Supabase project. Run `supabase/migrations/202611030001_learning.sql` through the SQL editor, or link the project and run `supabase db push` with the Supabase CLI.
2. In Authentication settings, enable email/password and **Confirm email**. Configure SMTP for production delivery, password requirements, rate limits and abuse protection. Set the site URL and allowlisted redirect URLs to the exact app root, for example `http://localhost:5173/` for development and `https://al-hassan-sameh.github.io/QuizletClone/` for Pages.
3. Enable Google in Authentication → Providers. In Google Cloud create an OAuth web client, configure the consent screen and authorized audiences, and add the callback URL displayed by Supabase (`https://PROJECT.supabase.co/auth/v1/callback`). Store the Google client secret only in the Supabase provider dashboard. Add your app URLs to the Supabase redirect allowlist.
4. Copy `.env.example` to an ignored `.env.local` and set only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to your project URL and public publishable/anon key. These values are intentionally public. Never use a service-role key in frontend variables. Rebuild with `npm run build` (or `npm run build:pages`). The tutor's server-only `.env` remains separate.
5. Deploy the `delete-account` Edge Function with JWT verification enabled: `supabase functions deploy delete-account`. Set `APP_ORIGINS` in the function's secrets to a comma-separated list of exact frontend origins (no paths). Supabase supplies its own URL and server credentials to the function; do not copy those into frontend configuration. The function validates the caller with `auth.getUser()` and deletes only that authenticated user's account. Snapshot rows cascade on account deletion.
6. Open Account Profile. Register, verify the email, and sign in, or select **Continue with Google**. Open the account workspace explicitly. Guest data is preserved separately. **Import guest material** copies sets, cards, progress, session/review history, question banks, attempts, notes, planner and bookmarks with fresh IDs and remapped links. Existing account preferences take priority. An active guest draft is copied only if the account has no draft of that type; conflicting drafts remain in the guest workspace.
7. Enable synchronization explicitly or select **Sync now**. Your data is sent only to the configured Supabase project. No study material is sent to an AI provider by synchronization.

## Isolation and offline behavior

`recall-local` remains the original guest database. Account libraries use `recall-account-USER_ID`. A workspace selector is a local storage convenience, not authentication. All cloud operations validate the actual current Supabase user and require that it matches the workspace. The server derives ownership from `auth.uid()`, never from a supplied owner ID. RLS denies other users and anonymous users; clients cannot write directly to the table. The revision RPC uses a compare-and-swap update with an empty search path. Service-role credentials exist only in the Edge Function runtime.

Downloaded material stays available offline after a browser restart. Anyone with access to this browser profile can read its IndexedDB and cached sessions; the app does not provide at-rest encryption. Use trusted devices and OS/browser security. Signing out returns to guest mode; downloaded data is retained for offline use unless explicitly removed. Cloud account deletion cannot remotely erase downloaded copies on other devices.

## Synchronization contract

The sync unit is a complete workspace snapshot, limited to 20 MB server-side. This favors correctness and simple recovery over large-library incremental transfers. When enabled, a persisted pending snapshot is refreshed and retried about every 10 seconds and on reconnection. Installed PWA assets and all local study tools work offline. Active timers use absolute deadlines; closing a tab does not pause an exam.

A snapshot records its last synchronized revision. If both local and remote change, automatic synchronization pauses. Export either version, then explicitly keep this device or the cloud version. Resolution retains both snapshots in a local recovery record, exportable from Account Profile. New writes during network requests remain queued or trigger a conflict. There is no automatic destructive merge, last-write-wins overwrite, or cross-account upload. A first sync against an existing remote workspace may request an explicit choice because no prior shared baseline exists. Do not discard local content merely to suppress that conflict.

Backups include sets, cards, schedules, reviews, questions, attempts, unfinished sessions, planner, notes, bookmarks and preferences. Auth tokens, provider secrets, tutor conversations and sync recovery records are excluded. Recovery records can be exported separately. Legacy version-1 backups remain accepted; complete restore intentionally replaces platform tables too. Export first.

## Required live validation before release

Use two test users and two browser profiles against a staging project. Verify email confirmation, sign-in/out, reset email and new password, Google new/existing accounts, callback allowlists, profile changes, and account deletion. Verify anonymous access is denied, user A cannot select user B's snapshot, direct table writes are denied, and stale RPC revisions return null. In two profiles, enable sync, edit offline on both, reconnect and verify a visible conflict and recovery exports. Test reconnect after session expiry and revocation. No hosted project or private credentials were supplied during this task, so these live checks remain external release requirements. Automated tests use mocked auth/transport and do not establish hosted OAuth or RLS correctness.

## Reproduce provider-mocked browser checks

The public values below deliberately identify a fake project. Playwright intercepts its requests; no real provider is contacted. These checks cover email registration/sign-in, profile updates, password-reset initiation, Google OAuth initiation and a mocked PKCE callback, account workspace isolation and guest import. They do not prove email delivery or real Google/Supabase authorization.

```sh
VITE_SUPABASE_URL=https://mock-recall.supabase.co VITE_SUPABASE_ANON_KEY=public-test-key npm run build
RECALL_MOCK_AUTH=1 npm run test:e2e -- tests/accounts.spec.ts
npm run build # restore the ordinary build without test-provider configuration
```

Keep the fake provider configuration out of deployed builds. The standard browser suite excludes `accounts.spec.ts`; run its explicit build/test commands separately.
