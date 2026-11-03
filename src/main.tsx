import React, { useState, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BookOpen,
  LayoutDashboard,
  Layers,
  Plus,
  BarChart3,
  Settings,
  Search,
  ArrowRight,
  ChevronRight,
  Star,
  MoreHorizontal,
  Upload,
  Download,
  Sun,
  Moon,
  WifiOff,
  RotateCcw,
  Keyboard,
  Check,
  Flame,
  Target,
  GraduationCap,
  Brain,
  CheckCircle2,
  Menu,
  CalendarDays,
  Bookmark,
  UserRound,
  ListChecks,
  Repeat,
  Puzzle,
} from "lucide-react";
import { db, exportBackup, restoreBackup, download } from "./db";
import {
  type StudySet,
  blankSet,
  blankCard,
  uid,
  streak,
  validateBackup,
} from "./domain";
import { Metric, SetTile, Modal } from "./components";
import { Editor } from "./Editor";
import { Study } from "./Study";
import { Stats } from "./Stats";
import "./style.css";
import "./platform.css";
const Practice = lazy(() =>
  import("./Practice").then((m) => ({ default: m.Practice })),
);
const QuestionBank = lazy(() =>
  import("./QuestionBank").then((m) => ({ default: m.QuestionBank })),
);
const Planner = lazy(() =>
  import("./StudyTools").then((m) => ({ default: m.Planner })),
);
const NotesBookmarks = lazy(() =>
  import("./StudyTools").then((m) => ({ default: m.NotesBookmarks })),
);
const ReviewQueue = lazy(() =>
  import("./StudyTools").then((m) => ({ default: m.ReviewQueue })),
);
const Matching = lazy(() =>
  import("./StudyTools").then((m) => ({ default: m.Matching })),
);
const Account = lazy(() =>
  import("./Account").then((m) => ({ default: m.Account })),
);
const CloudStatus = lazy(() =>
  import("./Account").then((m) => ({ default: m.CloudStatus })),
);

type Page =
  | "Practice"
  | "Exams"
  | "Question banks"
  | "Spaced Repetition"
  | "Study Planner"
  | "Bookmarks"
  | "Account Profile"
  | "Matching"
  | "Dashboard"
  | "My Study Sets"
  | "Create Set"
  | "Study"
  | "Statistics"
  | "Settings";
function App() {
  const sets = useLiveQuery(() => db.sets.toArray(), []);
  const sessions = useLiveQuery(
    () => db.sessions.orderBy("date").reverse().toArray(),
    [],
  );
  const reviewHistory = useLiveQuery(
    () => db.reviews.orderBy("date").reverse().toArray(),
    [],
  );
  const attempts = useLiveQuery(() => db.attempts.toArray(), []) || [];
  const [page, setPage] = useState<Page>(
    location.search.includes("code=") || location.hash.includes("type=recovery")
      ? "Account Profile"
      : "Dashboard",
  );
  const [editing, setEditing] = useState<StudySet | null>(null);
  const [dueOnly, setDueOnly] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("updated");
  const [favorites, setFavorites] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [dark, setDark] = useState(
    () => localStorage.getItem("recall-theme") === "dark",
  );
  const [help, setHelp] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    detail: string;
    action: () => Promise<void>;
  } | null>(null);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("recall-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    const on = () => setOffline(!navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const run = async (action: () => Promise<unknown>, message?: string) => {
    try {
      await action();
      if (message) setToast(message);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    }
  };
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target as HTMLElement).matches("input,textarea,select") &&
        !document.querySelector("dialog[open]")
      ) {
        const input = document.querySelector<HTMLInputElement>(
          'input[aria-label="Search study sets"]',
        );
        if (input) {
          e.preventDefault();
          input.focus();
        }
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const nav = (p: Page) => {
    window.scrollTo({ top: 0 });
    setPage(p);
    setEditing(null);
    setActive(null);
    setMobile(false);
    setSearch("");
  };
  const open = (s: StudySet) => {
    setDueOnly(false);
    setActive(s.id);
    setPage("Study");
    setEditing(null);
  };
  const edit = (s?: StudySet) => {
    setMobile(false);
    setEditing(s ? structuredClone(s) : blankSet());
    setPage("Create Set");
    setActive(null);
  };
  const allCards = sets?.flatMap((s) => s.cards) || [];
  const known = allCards.filter((c) => c.status === "known").length;
  const due = allCards.filter((c) => c.due <= Date.now()).length;
  const filtered = (sets || [])
    .filter(
      (s) =>
        (!favorites || s.favorite) &&
        (!folder || s.folder === folder || s.folder.startsWith(folder + "/")) &&
        (!tag || s.tags.includes(tag)) &&
        `${s.title} ${s.description} ${s.tags.join(" ")} ${s.cards.map((c) => c.term).join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "created"
          ? b.created - a.created
          : sort === "lastStudied"
            ? b.lastStudied - a.lastStudied
            : b.updated - a.updated,
    );
  const setActions = (s: StudySet, action: string) => {
    if (action === "edit") edit(s);
    if (action === "duplicate")
      run(
        () =>
          db.sets.add({
            ...structuredClone(s),
            id: uid(),
            title: `${s.title} (copy)`,
            created: Date.now(),
            updated: Date.now(),
            lastStudied: 0,
            cards: s.cards.map((c) => ({
              ...c,
              ...blankCard(),
              term: c.term,
              definition: c.definition,
              notes: c.notes,
            })),
          }),
        "Set duplicated",
      );
    if (action === "export")
      download(`${s.title}.json`, { version: 1, sets: [s], sessions: [] });
    if (action === "delete")
      setConfirm({
        title: "Delete this study set?",
        detail: `“${s.title}” and its flashcards will be permanently deleted. Export a backup first if you need one.`,
        action: async () => {
          await db.transaction(
            "rw",
            db.sets,
            db.sessions,
            db.reviews,
            async () => {
              await db.sets.delete(s.id);
              await db.sessions.where("setId").equals(s.id).delete();
              await db.reviews.where("setId").equals(s.id).delete();
            },
          );
          setToast("Set deleted");
        },
      });
  };
  const restoreFile = async (file: File | undefined, individual = false) => {
    if (!file) return;
    try {
      if (file.size > 25_000_000)
        throw new Error("Backup files are limited to 25 MB.");
      const text = await file.text();
      const data = validateBackup(JSON.parse(text));
      if (individual) {
        await db.sets.bulkAdd(
          data.sets.map((s) => ({
            ...s,
            id: uid(),
            cards: s.cards.map((c) => ({ ...c, id: uid() })),
          })),
        );
        setToast("Study sets imported");
      } else
        setConfirm({
          title: "Restore this backup?",
          detail:
            "This replaces all current sets and study history with the backup. Export your current data first.",
          action: async () => {
            await restoreBackup(data);
            setToast("Backup restored");
          },
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid backup");
    }
  };
  if (!sets || !sessions || !reviewHistory)
    return (
      <div className="loading">
        <BookOpen size={38} />
        <p>Opening your study space…</p>
      </div>
    );
  const selected = sets.find((s) => s.id === active);
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            nav("Dashboard");
          }}
        >
          <span className="brand-icon">
            <Layers size={23} />
          </span>
          recall<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          {(
            [
              { name: "Dashboard", icon: LayoutDashboard },
              { name: "My Study Sets", icon: Layers },
              { name: "Create Set", icon: Plus },
              { name: "Study", icon: GraduationCap },
              { name: "Practice", icon: Brain },
              { name: "Exams", icon: ListChecks },
              { name: "Question banks", icon: BookOpen },
              { name: "Spaced Repetition", icon: Repeat },
              { name: "Study Planner", icon: CalendarDays },
              { name: "Statistics", icon: BarChart3 },
              { name: "Bookmarks", icon: Bookmark },
              { name: "Matching", icon: Puzzle },
              { name: "Account Profile", icon: UserRound },
            ] as const
          ).map(({ name, icon: Icon }) => (
            <button
              className={`nav-item ${page === name ? "active" : ""}`}
              key={name}
              aria-label={name}
              onClick={() => (name === "Create Set" ? edit() : nav(name))}
            >
              <Icon size={19} />
              {name === "My Study Sets"
                ? "My Library"
                : name === "Study"
                  ? "Flashcards"
                  : name === "Statistics"
                    ? "Performance Analytics"
                    : name}
              {name === "My Study Sets" && (
                <span className="nav-count">{sets.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="local-dot" />
            Your knowledge. Your device.<p>Private by design. Always yours.</p>
          </div>
          <button
            className={`nav-item ${page === "Settings" ? "active" : ""}`}
            onClick={() => nav("Settings")}
          >
            <Settings size={19} />
            Settings
          </button>
          <button className="profile" onClick={() => nav("Account Profile")}>
            <span className="avatar">Y</span>
            <span>
              <strong>Your study space</strong>
              <small>Personal workspace</small>
            </span>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Toggle navigation"
            aria-expanded={mobile}
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <span className="breadcrumb">
            Workspace <ChevronRight size={14} />{" "}
            <strong>{page === "Create Set" ? "Set editor" : page}</strong>
          </span>
          <div className="top-actions">
            <span className={`local-badge ${offline ? "offline" : ""}`}>
              {offline ? <WifiOff size={14} /> : <span className="local-dot" />}
              {offline
                ? "Offline · saved locally"
                : page === "Create Set"
                  ? "Editing · not saved yet"
                  : "All changes saved locally"}
            </span>
            <button
              className="icon-button"
              aria-label="Keyboard shortcuts"
              onClick={() => setHelp(true)}
            >
              <Keyboard size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Toggle theme"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span className="avatar small">Y</span>
          </div>
        </header>
        <main>
          <Suspense
            fallback={
              <div className="loading" role="status">
                Opening your workspace…
              </div>
            }
          >
            {page === "Practice" || page === "Exams" ? (
              <Practice key={page} exam={page === "Exams"} sets={sets} />
            ) : page === "Question banks" ? (
              <QuestionBank />
            ) : page === "Study Planner" ? (
              <Planner sets={sets} />
            ) : page === "Bookmarks" ? (
              <NotesBookmarks sets={sets} />
            ) : page === "Matching" ? (
              <Matching sets={sets} />
            ) : page === "Account Profile" ? (
              <Account />
            ) : page === "Spaced Repetition" ? (
              <ReviewQueue
                sets={sets}
                open={(s) => {
                  open(s);
                  setDueOnly(true);
                }}
              />
            ) : page === "Create Set" ? (
              <Editor
                key={editing?.id || "new"}
                initial={editing || blankSet()}
                onCancel={() => nav("My Study Sets")}
                onSave={(s) =>
                  run(async () => {
                    await db.sets.put(s);
                    nav("My Study Sets");
                  }, "Study set saved")
                }
              />
            ) : page === "Study" && selected ? (
              <Study
                key={selected.id}
                dueOnly={dueOnly}
                set={selected}
                onBack={() => nav("Study")}
                run={run}
              />
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">
                      {page === "Dashboard"
                        ? "A LITTLE PROGRESS, EVERY DAY"
                        : page === "Statistics"
                          ? "SEE HOW FAR YOU’VE COME"
                          : "YOUR PERSONAL LEARNING SPACE"}
                    </div>
                    <h1>
                      {page === "Dashboard"
                        ? "Make room for a little learning."
                        : page === "My Study Sets"
                          ? "My study sets"
                          : page === "Study"
                            ? "What will you learn today?"
                            : page === "Statistics"
                              ? "Your learning, in focus."
                              : "Make yourself at home."}
                    </h1>
                    <p>
                      {page === "Dashboard"
                        ? "Big ideas start with small sessions. Pick up where you left off."
                        : page === "My Study Sets"
                          ? "Everything you’re learning, all in one place."
                          : page === "Study"
                            ? "Choose a set and find your flow."
                            : page === "Statistics"
                              ? "Every card counts. Here’s your progress so far."
                              : "Your preferences, your data, your control."}
                    </p>
                  </div>
                  {["Dashboard", "My Study Sets", "Study"].includes(page) && (
                    <button className="primary" onClick={() => edit()}>
                      <Plus size={18} /> Create a set
                    </button>
                  )}
                </div>
                {page === "Dashboard" && (
                  <>
                    <div className="dashboard-actions">
                      <button
                        className="secondary"
                        onClick={() => nav("Spaced Repetition")}
                      >
                        {due} cards due for review
                      </button>
                      <button
                        className="secondary"
                        onClick={() => nav("Practice")}
                      >
                        Practice weak material
                      </button>
                      <button
                        className="secondary"
                        onClick={() => nav("Study Planner")}
                      >
                        Plan your next session
                      </button>
                    </div>
                    <div className="hero">
                      <div className="hero-content">
                        <span className="hero-label">
                          <span /> BUILT FOR YOUR NEXT BREAKTHROUGH
                        </span>
                        <h2>
                          A few minutes.
                          <br />A little more confident.
                        </h2>
                        <p>
                          Turn what you want to know into what you remember.
                          <br />
                          Your next study session starts here.
                        </p>
                        <button
                          className="hero-button"
                          onClick={() =>
                            sets.length
                              ? open(
                                  [...sets].sort(
                                    (a, b) => b.lastStudied - a.lastStudied,
                                  )[0],
                                )
                              : edit()
                          }
                        >
                          {sets.length
                            ? "Start studying"
                            : "Create your first set"}
                          <ArrowRight size={17} />
                        </button>
                        <span className="hero-foot">
                          <CheckCircle2 size={13} /> Offline first. Your
                          learning, on your terms.
                        </span>
                      </div>
                      <div className="hero-art" aria-hidden="true">
                        <div className="orbit orbit-one" />
                        <div className="orbit orbit-two" />
                        <span className="spark spark-one">✦</span>
                        <span className="spark spark-two">✧</span>
                        <div className="art-card back-card" />
                        <div className="art-card front-card">
                          <span className="art-label">A LITTLE REMINDER</span>
                          <Brain size={38} />
                          <strong>
                            You know more
                            <br />
                            than you think.
                          </strong>
                          <span className="art-line" />
                          <small>Keep going. It’s adding up.</small>
                        </div>
                        <span className="floating-check">
                          <Check size={23} />
                        </span>
                      </div>
                    </div>
                    <div className="metrics">
                      <Metric
                        icon={<Layers />}
                        label="Study sets"
                        value={sets.length}
                        foot="Ideas worth remembering"
                        color="purple"
                      />
                      <Metric
                        icon={<BookOpen />}
                        label="Total flashcards"
                        value={allCards.length}
                        foot="One card at a time"
                        color="blue"
                      />
                      <Metric
                        icon={<Target />}
                        label="Cards mastered"
                        value={known}
                        foot={
                          allCards.length
                            ? `${Math.round((known / allCards.length) * 100)}% of your collection`
                            : "Your progress starts here"
                        }
                        color="green"
                      />
                      <Metric
                        icon={<Flame />}
                        label="Study streak"
                        value={`${streak([...sessions, ...attempts])} days`}
                        foot="Build a little momentum"
                        color="orange"
                      />
                    </div>
                    <div className="section-heading">
                      <div>
                        <h2>
                          Your study sets <span>{sets.length}</span>
                        </h2>
                        <p>A familiar place for your next big idea.</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => nav("My Study Sets")}
                      >
                        View all sets <ArrowRight size={16} />
                      </button>
                    </div>
                  </>
                )}
                {["Dashboard", "My Study Sets", "Study"].includes(page) && (
                  <>
                    {page !== "Dashboard" && (
                      <div className="study-banner">
                        <Brain size={24} />
                        <span>
                          <strong>{due} cards ready for review</strong>
                          <small>
                            Review a little today. Remember more tomorrow.
                          </small>
                        </span>
                        <span className="pill">Spaced repetition</span>
                      </div>
                    )}
                    <div className="filters">
                      <label className="search">
                        <Search size={18} />
                        <input
                          aria-label="Search study sets"
                          placeholder="Search your study sets…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                        <kbd>/</kbd>
                      </label>
                      <select
                        aria-label="Filter folder"
                        value={folder}
                        onChange={(e) => setFolder(e.target.value)}
                      >
                        <option value="">All folders</option>
                        {[
                          ...new Set(
                            sets.flatMap((s) =>
                              s.folder
                                .split("/")
                                .filter(Boolean)
                                .map((_, i, parts) =>
                                  parts.slice(0, i + 1).join("/"),
                                ),
                            ),
                          ),
                        ].map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                      <select
                        aria-label="Filter tag"
                        value={tag}
                        onChange={(e) => setTag(e.target.value)}
                      >
                        <option value="">All tags</option>
                        {[...new Set(sets.flatMap((s) => s.tags))].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                      <button
                        className={`filter-favorite ${favorites ? "selected" : ""}`}
                        onClick={() => setFavorites(!favorites)}
                        aria-label="Filter favorites"
                      >
                        <Star
                          size={17}
                          fill={favorites ? "currentColor" : "none"}
                        />
                      </button>
                      <select
                        aria-label="Sort study sets"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="updated">Recently updated</option>
                        <option value="title">Name</option>
                        <option value="created">Date created</option>
                        <option value="lastStudied">Last studied</option>
                      </select>
                    </div>
                    {filtered.length ? (
                      <div className="set-grid">
                        {filtered
                          .slice(0, page === "Dashboard" ? 6 : undefined)
                          .map((s, i) => (
                            <SetTile
                              key={s.id}
                              set={s}
                              index={i}
                              open={() => open(s)}
                              action={(a) => setActions(s, a)}
                              favorite={() =>
                                run(() =>
                                  db.sets.update(s.id, {
                                    favorite: !s.favorite,
                                  }),
                                )
                              }
                            />
                          ))}
                      </div>
                    ) : (
                      <div className="empty">
                        <span className="empty-icon">
                          <Layers size={30} />
                        </span>
                        <h2>
                          {sets.length
                            ? "No sets found"
                            : "A fresh page for your next idea."}
                        </h2>
                        <p>
                          {sets.length
                            ? "Try another search or clear your filters."
                            : "Create your first study set. A few cards can take you a long way."}
                        </p>
                        <button className="primary" onClick={() => edit()}>
                          <Plus size={17} />
                          Create a study set
                        </button>
                      </div>
                    )}
                    {page === "Dashboard" && (
                      <div className="bottom-tip">
                        <span className="tip-icon">✦</span>
                        <div>
                          <strong>A small habit. A lasting difference.</strong>
                          <p>
                            Short, regular sessions help memories stick. Even
                            five minutes is a good start.
                          </p>
                        </div>
                        <span className="pill">You’ve got this</span>
                      </div>
                    )}
                  </>
                )}
                {page === "Statistics" && (
                  <Stats
                    sets={sets}
                    sessions={sessions}
                    reviews={reviewHistory}
                  />
                )}
                {page === "Settings" && (
                  <div className="settings-grid">
                    <section className="panel">
                      <h2>Appearance</h2>
                      <p>Find the right light for your study space.</p>
                      <button
                        className="secondary"
                        onClick={() => setDark(!dark)}
                      >
                        {dark ? <Sun size={18} /> : <Moon size={18} />} Switch
                        to {dark ? "light" : "dark"} theme
                      </button>
                      <hr />
                      <h2>Offline & installation</h2>
                      <p>
                        Recall saves everything in IndexedDB on this browser.
                        After one online visit to the production app, its assets
                        are cached for offline use.
                      </p>
                      <p>
                        Use your browser’s “Install app” or “Add to Home Screen”
                        option when available. Development mode does not cache
                        offline assets.
                      </p>
                      <p className="notice">
                        Browser storage can be cleared by your browser or
                        device. Export regular backups to keep a separate copy.
                      </p>
                      <button
                        className="secondary"
                        onClick={() => setHelp(true)}
                      >
                        <Keyboard size={18} />
                        Keyboard shortcuts
                      </button>
                    </section>
                    <section className="panel">
                      <h2>Your data belongs to you.</h2>
                      <p>
                        Complete backups include sets, cards, schedules, and
                        session history. Restoring a backup replaces your
                        current library.
                      </p>
                      <button
                        className="secondary"
                        onClick={() =>
                          run(
                            async () =>
                              download(
                                "recall-backup.json",
                                await exportBackup(),
                              ),
                            "Backup exported",
                          )
                        }
                      >
                        <Download size={17} />
                        Export complete backup
                      </button>
                      <label className="secondary file-button">
                        <Upload size={17} />
                        Restore complete backup
                        <input
                          type="file"
                          accept="application/json,.json"
                          onChange={(e) => {
                            void restoreFile(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <hr />
                      <h2>Bring your knowledge along</h2>
                      <p>
                        Import individual Recall set files, or add CSV cards in
                        the set editor. Individual set imports are added to your
                        library.
                      </p>
                      <label className="secondary file-button">
                        <Upload size={17} />
                        Import study set JSON
                        <input
                          type="file"
                          accept="application/json,.json"
                          onChange={(e) => {
                            void restoreFile(e.target.files?.[0], true);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <hr />
                      <button
                        className="danger-text"
                        onClick={() =>
                          setConfirm({
                            title: "Reset all learning progress?",
                            detail:
                              "Your sets and cards stay. All review schedules and study history will be reset.",
                            action: async () => {
                              await db.transaction(
                                "rw",
                                db.sets,
                                db.sessions,
                                db.reviews,
                                async () => {
                                  for (const s of sets)
                                    await db.sets.put({
                                      ...s,
                                      lastStudied: 0,
                                      cards: s.cards.map((c) => ({
                                        ...c,
                                        ...blankCard(),
                                        id: c.id,
                                        term: c.term,
                                        definition: c.definition,
                                        notes: c.notes,
                                      })),
                                    });
                                  await db.sessions.clear();
                                  await db.reviews.clear();
                                },
                              );
                              setToast("Learning progress reset");
                            },
                          })
                        }
                      >
                        <RotateCcw size={16} />
                        Reset study progress
                      </button>
                    </section>
                  </div>
                )}
              </>
            )}
          </Suspense>
          <Suspense fallback={null}>
            <CloudStatus />
          </Suspense>
          <footer>
            <span>
              <Layers size={14} /> recall · A little learning goes a long way.
            </span>
            <span>
              <span className="local-dot" />
              Stored on your device
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {error && (
        <Modal
          title="Something needs your attention"
          onClose={() => setError("")}
        >
          <p role="alert">{error}</p>
          <button className="primary" onClick={() => setError("")}>
            Got it
          </button>
        </Modal>
      )}
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <p>{confirm.detail}</p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              className="danger"
              onClick={() => {
                const action = confirm.action;
                setConfirm(null);
                void run(action);
              }}
            >
              Confirm
            </button>
          </div>
        </Modal>
      )}
      {help && (
        <Modal
          title="A little shortcut to learning"
          onClose={() => setHelp(false)}
        >
          <div className="shortcut-row">
            <span>Search study sets</span>
            <kbd>/</kbd>
          </div>
          <div className="shortcut-row">
            <span>Flip flashcard</span>
            <kbd>Space</kbd>
          </div>
          <div className="shortcut-row">
            <span>Previous / next card</span>
            <kbd>← / →</kbd>
          </div>
          <p>
            Keyboard controls work in Flashcards mode. Use Tab to navigate
            controls and Escape to close dialogs.
          </p>
        </Modal>
      )}
    </div>
  );
}
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error)
      return (
        <div className="loading">
          <h1>We couldn’t open your study space.</h1>
          <p>
            Make sure this browser allows local storage, then try reloading.
            Your data has not been reset.
          </p>
          <button className="primary" onClick={() => location.reload()}>
            Reload Recall
          </button>
        </div>
      );
    return this.props.children;
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
