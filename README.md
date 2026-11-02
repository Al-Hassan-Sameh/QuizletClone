# Recall

A private, offline-first flashcard and study app built with React, strict TypeScript, Vite, Tailwind CSS, Dexie (IndexedDB), Lucide icons, and a precaching PWA service worker. No accounts, backend, remote fonts, or runtime APIs.

## Run locally

Requires Node.js 22.12+ (validated on 24) and npm.

```sh
npm ci
npm run dev
```

Create a set from the dashboard; add individual cards, paste tab-separated pairs, or import CSV. Organize sets by folder, tags, and favorites. Set menus offer editing, duplication, JSON export, and confirmed deletion.

```sh
npm test             # domain and IndexedDB tests
npm run build        # strict TypeScript and production PWA bundle
npm run test:e2e     # desktop and mobile browser acceptance tests
npm run preview      # serve the production build
```

The Playwright config uses `/usr/bin/chromium` when available; otherwise run `npx playwright install chromium` first. Browser downloads require network access to Playwright's download hosts. Run `npm run build` before browser tests. The browser suite starts the production preview itself.

## Study

- **Flashcards:** click/Space to flip; arrows or buttons to navigate; shuffle, restart, status/due filters, fullscreen, and known/still-learning ratings. Finish a session to save its summary. Individual ratings save immediately.
- **Learn:** multiple choice, written answers, and true/false with immediate feedback, an automatic extra attempt for difficult cards, results, and missed-card retries.
- **Test:** choose a question count and formats, submit all answers, review results, and retry missed cards. Missing answers are incorrect. One-definition sets fall back to written questions.
- **Statistics:** actual session activity, weighted test accuracy, mastery, daily activity, local-calendar streaks, and session history.

Written answers compare trimmed, collapsed whitespace and case only; synonyms and semantic guesses are not accepted.

## Scheduling

The simplified SM-2 scheduler is deterministic. New/failed cards are due immediately until reviewed. A successful recall schedules 1 day, then 6 days, then the previous interval multiplied by ease and rounded. Ease starts at 2.5, increases 0.1 on success, and decreases 0.2 on failure with a minimum of 1.3. Failure resets the interval to 1 day. Review count, last review, due time, interval, ease, and learning status persist per card. “Mastered” means last rated/recalled correctly, not a promise of long-term retention. Schedules use elapsed 24-hour days; streaks use local calendar dates.

## Offline installation

Build and serve `dist/` over HTTPS (localhost is also a secure context). Open the app online once and allow the service worker to finish installing; subsequent visits can load without a network. Use the browser's Install app / Add to Home Screen command when supported. Installation prompts depend on the browser. The Vite development server intentionally does not install a service worker.

All required scripts, styles, icons, and assets are bundled and precached. Data lives in this browser's IndexedDB, separate from the asset cache. Asset updates never clear user data. Database schema versions 1 and 2 are declared in `src/db.ts`; future schema changes must add Dexie versions/upgrades instead of deleting the database. Storage is scoped to the origin, so a different domain or port has a separate library. Theme preference is saved in localStorage.

## Backups and imports

Settings → **Export complete backup** downloads versioned JSON with all sets, cards, review schedules, and session history. **Restore complete backup** validates the file and asks for confirmation before atomically replacing the library. Invalid files leave existing data untouched. Export regularly: clearing browser data, private browsing, device loss, or storage eviction can remove local data. Recall cannot synchronize across devices; move backups yourself.

Set menu → **Export JSON** exports one set. Settings → **Import study set JSON** adds independent copies with new IDs, preserving the current library. Set editor CSV accepts `term,definition,notes` (optional header), quoted commas, escaped quotes and embedded newlines. TSV paste accepts one term/definition pair per line, with optional notes in a third column.

## Structure

- `src/domain.ts`: types, scheduling, question generation, grading, import validation, streaks.
- `src/db.ts`: versioned Dexie schema, transactional backups, file exports.
- `src/main.tsx`: application state, navigation, dashboard and settings.
- `src/Editor.tsx`, `src/Study.tsx`, `src/Stats.tsx`, `src/components.tsx`: focused feature screens and reusable UI.
- `src/style.css`: responsive design, themes, animations, reduced-motion support.
- `src/domain.test.ts`: storage, import/export, grading, question and schedule tests.
- `tests/app.spec.ts`: browser acceptance tests including offline production loading.

## Scope

Content stays on the device. There is no cloud synchronization, collaboration, account recovery, media attachment support, or matching game. The optional matching game is intentionally omitted. Session history retains summaries; a separate per-card review log records outcomes and scheduled intervals. Keep a backup before changing device, browser, or origin.
