# Learning platform implementation report

## Baseline problems

The original Recall app had reliable offline flashcards, local math rendering, backups, mixed quizzes and optional tutoring, but no independent question banks, configurable timed exams, planner, matching, bookmarks, linked notes, account authentication or cloud synchronization. Analytics lacked topic results and measured exam/practice duration. Generated distractors were deduplicated by raw text, allowing equivalent choices. Invalid backup titles could call string methods on non-string data. The supplied original-project section was a placeholder; the repository README and passing baseline suite were used as the starting specification. See [the audit](UPGRADE_AUDIT.md).

## Implemented

- Added lazy-loaded platform routes with consistent light/dark surfaces, a responsive sidebar and an accessible navy MCQ focus canvas. Numeric shortcuts, numbered choices, mobile stacking, correct/incorrect choice highlights and explanations are supported. Navigation resets scroll and new prompts receive keyboard focus.
- Added independent question banks with validated 2–6-choice creation/editing, difficulty, categories, hints, explanations, duplication, bookmarks, deletion undo and bulk JSON import/export.
- Added adaptive practice and mistake review. Generated distractors use normalized unique answers from the same set. Authored written alternatives and exact/normalized checking are configurable per card. Added reverse flashcards, card bookmarks and a matching game with measured time and stored accuracy.
- Added multi-source exams with counts, formats (including mixed formats), difficulty, time limits, optional immediate feedback/explanations, question navigation, review flags, persistent drafts, absolute deadlines, timed submission, stored attempts, detailed answer review, retakes and incorrect-answer retries. Submission deduplicates an already-saved attempt from another tab; removed source cards do not invalidate the saved answer snapshot.
- Added offline daily goals, dated study/review/exam tasks, completion tracking, linked sets, searchable topic notes and saved material. Parent folder filters include descendant paths.
- Added topic accuracy and weak-topic ordering, weekly practice/exam results, measured practice/exam duration, upcoming review workload and streaks that include bank-only practice. All analytics derive from actual stored events/attempts.
- Added Dexie schema 3 without deleting the old tables. Version-2 complete backups include the new data and accept legacy version-1 imports. Invalid restores validate before replacing data and run transactionally. Set duplication and progress resets preserve authored checking/difficulty metadata.
- Added the official Supabase authentication integration: email registration/sign-in, email confirmation setup, password recovery/update, Google OAuth with PKCE, profile/display-name/email updates, sign-out and an authorized account-deletion Edge Function.
- Added separate account/guest databases, explicit lossless guest import with remapped links, opt-in snapshot synchronization, persisted pending snapshots, reconnect retries, owner checks, RLS, atomic revision checks, visible conflicts, explicit resolution and local recovery exports. Guest imports preserve the original guest database; conflicting unfinished drafts remain there instead of replacing account drafts.

## Run and install

Use Node.js 22.12+ (validated on 24):

```sh
npm ci
npm run dev
```

For the installable offline PWA:

```sh
npm run build
npm run preview
```

Open the production app once online, reload to complete service-worker caching, then use your browser's Install app / Add to Home Screen command. Development mode intentionally does not install a worker. `npm run build:pages` targets `/QuizletClone/`. Database storage belongs to the browser origin; export and restore when changing origins.

## Authentication configuration

Follow [ACCOUNTS.md](ACCOUNTS.md): configure a real Supabase project, apply the SQL migration, enable verified email and Google, set exact callback/redirect URLs and SMTP, deploy the deletion function with its allowed origins, and supply the public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` before building. Keep all service-role/Google client secrets server-side. Guest mode needs none of these services. Existing optional tutor setup is unchanged and uses separate server credentials.

## Verification

- `npm test`: **49 passed**, including the real IndexedDB v2→v3 migration, full/legacy backup behavior, guest import reference remapping, MCQ integrity, adaptive ordering, accepted alternatives and mocked sync transport failures/conflicts.
- `npm run test:tutor:server`: **7 passed**.
- `npm run test:accounts:server`: **3 passed**, executing the deletion handler source with mocked provider responses to check origins, methods, validated caller identity and sanitized errors.
- `npm run test:accounts:db`: passed the actual SQL migration in local PGlite PostgreSQL, testing own-row reads, cross-user isolation, anonymous denial, direct-write denial, invalid snapshots and atomic revision compare-and-swap. Its `auth.uid()` test helper emulates authenticated request claims; it does not test hosted JWT verification.
- `npm run build`: strict TypeScript and production PWA succeeded. Routes for accounts and study tools split into separate assets; the existing math/application bundle still emits Vite's size advisory.
- `npm run test:e2e`: **50 passed**, desktop and mobile, including all 38 baseline tests plus 12 new platform checks. Offline loading, data restoration, keyboard MCQs, timed exam recovery, matching and automated WCAG AA checks in both themes passed.
- Separate mock-provider build: **6 passed** desktop/mobile account tests for email registration/sign-in, profile updates, password-reset initiation, Google authorization initiation, a mocked PKCE callback, account isolation and explicit guest import. The ordinary build was restored afterward; it contains no test-provider URL.
- `git diff --check`: passed.

## Remaining dependencies and limitations

Hosted email delivery/verification, real Google consent and authorization, deployed Edge Function execution, hosted RLS/JWT configuration and multi-device live synchronization require a real configured Supabase project and staging validation. No private provider credentials were supplied; none of these live checks is claimed to have passed. The local SQL and mocked transport tests are distinct from hosted validation.

Synchronization intentionally operates on full workspace snapshots with a 20 MB server limit. It does not implement per-record merging or real-time collaboration. Conflicts require an explicit choice and retain recovery copies. Unsynchronized data in a browser process that is forcibly terminated remains in IndexedDB and is rediscovered on the next sync; the compact pending snapshot refreshes every ten seconds while automatic synchronization is enabled.

Exams are personal study tools, not authoritative/proctored assessments. Timers count wall-clock time, including time away; local browser owners can inspect their data. Folder organization uses slash-separated paths and parent filters, not a draggable folder tree. Notes support plain text and local LaTeX rather than an arbitrary rich-HTML editor. Generated distractors come from the same set; authors should review semantic plausibility. Practice uses transparent performance-weighted ordering and mistake retries, not an AI prediction model.

Large legacy sets remain embedded in one IndexedDB record and analytics scan local history; very large libraries need further normalization/indexed aggregation work. New AI content-generation features remain future optional work; the existing explicit-consent tutor and ChatGPT handoff remain available. Browser data and cached sessions are not encrypted by the application, and deleting a cloud account cannot remotely erase downloaded copies on other devices. Export regular backups.
