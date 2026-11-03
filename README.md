# Recall

A private, offline-first flashcard and study app built with React, strict TypeScript, Vite, Tailwind CSS, Dexie (IndexedDB), Lucide icons, and a precaching PWA service worker. Core study works without accounts, a backend, or runtime APIs. The optional context-aware AI tutor uses a separately configured authenticated backend; see [AI tutor setup](docs/AI_TUTOR.md).

## Use your existing ChatGPT plan

Open a study card and choose **Ask AI Tutor → ChatGPT — existing plan** (the default). Enter your question, select **1. Copy study prompt**, then **2. Open ChatGPT**. Paste and send the prompt in ChatGPT. Your normal plan limits apply; this path needs no API key, extra API billing, or hosted backend.

The preview shows exactly what is copied. Answers and private notes are excluded before reveal; notes require explicit opt-in after reveal. Study content is never included in the ChatGPT URL or submitted automatically. If clipboard permission fails, select and copy the preview manually. Conversations stay in ChatGPT and do not sync into Recall. Copy a fresh prompt when switching cards. During unsubmitted tests the tutor remains unavailable.

The separate **Embedded AI — separate API billing** tab is available for independently configured API services and is not covered by ChatGPT Plus.

## Open on Windows with a desktop shortcut

Open Recall from a browser or its own app window. No Node.js installation or terminal commands are required for this route.

The intended browser-app address is **https://al-hassan-sameh.github.io/QuizletClone/**. Availability depends on GitHub Pages being enabled for this repository.

### Repository owner: enable the website once

1. Open the repository on GitHub and select **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the **gh-pages** branch and **/(root)** folder, then click **Save**.
4. Wait for deployment to finish. Refresh the Pages settings until **Visit site** appears, then click it.

### Create your Windows shortcut

The repository ZIP includes **Recall.url**. After the website is enabled, copy that file to your Windows desktop and double-click it to open Recall in your default browser. Alternatively, right-click your desktop, choose **New → Shortcut**, paste the website address, click **Next**, name it **Recall**, and click **Finish**.

If you prefer a separate app window instead of a browser tab:

1. Open the website in **Microsoft Edge** or **Google Chrome** using your usual browser profile.
2. Let the app fully load while online, then reload it once so its offline assets can finish caching.
3. Click the **Install app** icon in the address bar when available. Alternatively, open the browser menu and choose **Apps → Install this site as an app** in Edge, or **Cast, save, and share → Install page as app** in Chrome. Menu wording varies by browser version.
4. Select **Create desktop shortcut** if offered. If you prefer a browser shortcut, use the browser's **Create shortcut** command instead; select **Open as window** when that option is offered.
5. Double-click the new **Recall** shortcut whenever you want to study. After the first successful online load and caching, the app can reopen offline.

Keep using the same browser profile. Existing study data from `localhost` belongs to a different browser origin: export it through **Settings → Export complete backup** in the old app, then use **Restore complete backup** in the hosted app. Restore replaces that destination's current library, so export any data there first. Export backups regularly, and avoid clearing this site's browser data because that removes locally stored sets and progress.

## Run locally

Requires Node.js 22.12+ (validated on 24) and npm.

```sh
npm ci
npm run dev
```

Create a set from the dashboard; add individual cards, paste tab-separated pairs, or import CSV. Organize sets by folder, tags, and favorites. Set menus offer editing, duplication, JSON export, and confirmed deletion.

Card text supports Anki-style inline and display LaTeX delimiters, rendered locally with KaTeX in flashcards, quizzes, answer reviews, and review history. Invalid expressions remain visible as source text so they can be corrected in the editor. Imported Anki line breaks are displayed as line breaks; rendering does not require external services.

```sh
npm test             # domain and IndexedDB tests
npm run build        # strict TypeScript and production PWA bundle
npm run build:pages  # build for /QuizletClone/ on GitHub Pages
npm run test:e2e     # desktop and mobile browser acceptance tests
npm run preview      # serve the production build
```

The Playwright config uses `/usr/bin/chromium` when available; otherwise run `npx playwright install chromium` first. Browser downloads require network access to Playwright's download hosts. Run `npm run build` before browser tests. The browser suite starts the production preview itself.

## Study

- **Flashcards:** click/Space to flip; arrows or buttons to navigate; shuffle, restart, status/due filters, fullscreen, and known/still-learning ratings. Long answers scroll from their beginning. **Full screen** beside Shuffle expands the reading area; use **Exit full screen** or Escape to return. Finish a session to save its summary. Individual ratings save immediately.
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

### Mathematically rigorous quantum mechanics example

The decks folder includes 100 mechanism-focused quantum mechanics flashcards, ordered as 20 beginner, 50 intermediate, and 30 advanced. Each answer states a mathematical argument, relevant assumptions, and its physical conclusion.

- Import [the complete Recall study set](decks/Quantum_Mechanics_100_Rigorous_Recall_Set.json) under Settings → Import study set JSON. This adds a set without replacing existing data.
- Alternatively import [the three-column CSV](decks/Quantum_Mechanics_100_Rigorous_Recall.csv) in the set editor.
- [The five-column Anki CSV](decks/Quantum_Mechanics_100_Rigorous_Anki.csv) retains IDs, difficulty, and topic tags.

Use Flashcards mode for self-assessing derivations; written-answer auto-grading still requires an exact text match, not an equivalent proof.

## Structure

- `src/domain.ts`: types, scheduling, question generation, grading, import validation, streaks.
- `src/db.ts`: versioned Dexie schema, transactional backups, file exports.
- `src/main.tsx`: application state, navigation, dashboard and settings.
- `src/Editor.tsx`, `src/Study.tsx`, `src/Stats.tsx`, `src/components.tsx`: focused feature screens and reusable UI.
- `src/style.css`: responsive design, themes, animations, reduced-motion support.
- `src/domain.test.ts`: storage, import/export, grading, question and schedule tests.
- `tests/app.spec.ts`: browser acceptance tests including offline production loading.

## Scope

Core study content stays on the device. The optional AI tutor shares the selected card context with the configured service only when you send a message, and can optionally save its conversation to your tutor service account. There is no study-library cloud synchronization, collaboration, account recovery, media attachment support, or matching game. The optional matching game is intentionally omitted. Session history retains summaries; a separate per-card review log records outcomes and scheduled intervals. Keep a backup before changing device, browser, or origin.
