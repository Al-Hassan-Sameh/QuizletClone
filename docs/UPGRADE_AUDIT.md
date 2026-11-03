# Learning platform audit and upgrade plan

Baseline: the repository README is the available original specification; the supplied master prompt contains a placeholder rather than an additional original prompt.

## Existing capabilities

React 19, strict TypeScript, Dexie schemas 1–2, PWA precaching, safe local KaTeX, themes, responsive navigation, flashcard keyboard/fullscreen controls, SM-2 scheduling, generated mixed quizzes, difficult-card repeats, CSV/TSV import, JSON backups, review history and optional consent-based tutor. Baseline validation: 30 unit tests, 7 tutor server tests and 38 browser tests pass. Existing data is in `recall-local`; never delete it during migration.

## Priorities and findings

| Priority | Category                | Finding and implementation direction                                                                                                                                                                                                                                                               |
| -------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Critical fixes          | Backup validation calls string methods on untrusted values; normalize distractors before deduplicating; retain transactional restores and validate new data before writes.                                                                                                                         |
| P0       | Security                | No application authentication or synchronization exists. Integrate Supabase Auth rather than storing passwords; private RLS snapshots, compare-and-swap revisions, separate account IndexedDB databases, explicit guest import, explicit conflict resolution. Never put service-role keys in Vite. |
| P1       | Core functionality      | Generated quizzes only; add independent authored 2–6 choice questions, explanations, hints, difficulty, categories, edit/duplicate/import, and adjustable generated choices.                                                                                                                       |
| P1       | Major new features      | Timed multi-source exams, flags, navigation, persisted drafts/attempts, retakes, detailed review; preserve existing Learn/Test.                                                                                                                                                                    |
| P1       | UI/UX                   | Extend Recall branding into a coherent sidebar, focus-oriented navy MCQ surface, numbered answers, two-column desktop/single-column mobile choices, visible feedback and progress, accessible forms/status.                                                                                        |
| P2       | Advanced learning       | Weak-first practice, mistaken-material queue, reverse flashcards, matching, accepted written alternatives, due-review recommendations and workload.                                                                                                                                                |
| P2       | Study tools             | Offline daily goals, scheduled tasks/exam dates, searchable linked notes, saved cards/questions, real event-based topic and duration analytics.                                                                                                                                                    |
| P2       | Reliability/performance | Lazy-load account and platform screens, append Dexie schemas, complete backups including new tables, recoverable errors, transactional updates, bounded imports. Large legacy flashcard sets remain embedded in a set record; large-data normalization is a future optimization.                   |

## Architecture and safety

Add platform domain/storage modules alongside the proven study screens. New tables hold question banks, attempts/drafts, planner, notes, bookmarks and preferences. Existing tables and IDs survive upgrades. Supabase stores versioned full-workspace snapshots: deliberate coarse conflicts are safer than silently merging incompatible edits. Persist a pending snapshot and base revision locally; retry on reconnection; changes during a request remain pending. Replacing either side on conflict requires an explicit choice and retains a recovery copy. Offline study does not depend on auth availability. Hosted email/OAuth/RLS checks require a real configured project and are reported separately from mocks.

## Validation gates

Domain tests for duplicate/invalid choices, grading, import limits, migrations, backup restore, scheduling, persistence and synchronization conflicts. Browser tests for authored questions, numeric shortcuts, timed exams, planner, bookmarks, offline reload and old workflows on desktop/mobile. Run TypeScript/production build and tutor tests; retain existing acceptance suite. Live auth checks are external integration gates, never inferred from mocked success.
