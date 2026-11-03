import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { uid, shuffle, type StudySet } from "./domain";
import { localDay, type PlanTask, type StudyNote } from "./platform";
import { MathText } from "./MathText";
export function Planner({ sets }: { sets: StudySet[] }) {
  const tasks = useLiveQuery(() => db.tasks.orderBy("date").toArray()) || [];
  const goal = useLiveQuery(() => db.preferences.get("dailyGoal"));
  const reviews = useLiveQuery(() => db.reviews.toArray()) || [];
  const attempts = useLiveQuery(() => db.attempts.toArray()) || [];
  const [task, setTask] = useState<PlanTask>({
    id: uid(),
    title: "",
    date: localDay(),
    kind: "study",
    setId: "",
    done: false,
  });
  const [error, setError] = useState("");
  const [completion, setCompletion] = useState<Record<string, boolean>>({});
  const today =
    reviews.filter((r) => localDay(new Date(r.date)) === localDay()).length +
    attempts
      .filter((a) => localDay(new Date(a.date)) === localDay())
      .reduce(
        (n, a) => n + a.questions.filter((q) => q.source === "bank").length,
        0,
      );
  async function save(action: () => Promise<unknown>) {
    try {
      await action();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="platform-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE TIME FOR PROGRESS</div>
          <h1>Study planner</h1>
          <p>Your goals and exam preparation, available offline.</p>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <section className="panel goal-panel">
        <h2>Your daily goal</h2>
        <label>
          Reviews per day
          <input
            type="number"
            min={1}
            max={1000}
            value={goal?.value || "20"}
            onChange={(e) =>
              void save(() =>
                db.preferences.put({
                  id: "dailyGoal",
                  value: String(
                    Math.min(1000, Math.max(1, Number(e.target.value) || 1)),
                  ),
                }),
              )
            }
          />
        </label>
        <progress
          aria-label="Daily goal progress"
          value={today}
          max={Number(goal?.value || 20)}
        />
        <p>
          {today} reviews today · goal {goal?.value || 20}
        </p>
      </section>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          void save(async () => {
            if (!task.title.trim()) throw new Error("Add a task title.");
            await db.tasks.add({ ...task, title: task.title.trim() });
            setTask({ ...task, id: uid(), title: "" });
          });
        }}
      >
        <h2>Plan a study session</h2>
        <div className="two-col">
          <label>
            Task title
            <input
              required
              maxLength={200}
              value={task.title}
              onChange={(e) => setTask({ ...task, title: e.target.value })}
            />
          </label>
          <label>
            Scheduled date
            <input
              type="date"
              required
              value={task.date}
              onChange={(e) => setTask({ ...task, date: e.target.value })}
            />
          </label>
          <label>
            Task type
            <select
              aria-label="Task type"
              value={task.kind}
              onChange={(e) =>
                setTask({ ...task, kind: e.target.value as PlanTask["kind"] })
              }
            >
              <option value="study">Study</option>
              <option value="review">Review</option>
              <option value="exam">Exam date</option>
            </select>
          </label>
          <label>
            Linked study set
            <select
              aria-label="Linked study set"
              value={task.setId}
              onChange={(e) => setTask({ ...task, setId: e.target.value })}
            >
              <option value="">General study</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="primary">Add task</button>
      </form>
      <section className="panel">
        <h2>Your preparation plan</h2>
        {!tasks.length && <p>No scheduled tasks yet.</p>}
        {tasks.map((t) => (
          <div className="task-row" key={t.id}>
            <label className="check-label">
              <input
                type="checkbox"
                checked={completion[t.id] ?? t.done}
                onChange={(e) => {
                  const done = e.target.checked;
                  setCompletion((v) => ({ ...v, [t.id]: done }));
                  void save(async () => {
                    try {
                      await db.tasks.update(t.id, { done });
                    } catch (e) {
                      setCompletion((v) => ({ ...v, [t.id]: t.done }));
                      throw e;
                    }
                  });
                }}
              />
              <span className={t.done ? "completed" : ""}>{t.title}</span>
            </label>
            <span>
              {t.date} · {t.kind}
              {t.date < localDay() && !t.done ? " · Overdue" : ""}
            </span>
            <button
              className="secondary"
              onClick={() => void save(() => db.tasks.delete(t.id))}
              aria-label={`Delete task ${t.title}`}
            >
              Delete
            </button>
          </div>
        ))}
        <p>
          {tasks.filter((t) => t.done).length} of {tasks.length} tasks
          completed.
        </p>
      </section>
    </div>
  );
}
export function NotesBookmarks({ sets }: { sets: StudySet[] }) {
  const bookmarks = useLiveQuery(() => db.bookmarks.toArray()) || [];
  const notes =
    useLiveQuery(() => db.notes.orderBy("updated").reverse().toArray()) || [];
  const banks = useLiveQuery(() => db.banks.toArray()) || [];
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<StudyNote>({
    id: uid(),
    title: "",
    body: "",
    topic: "",
    setId: "",
    updated: Date.now(),
  });
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="platform-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">KEEP WHAT MATTERS CLOSE</div>
          <h1>Bookmarks & notes</h1>
          <p>Save questions, bookmark cards, and connect your ideas.</p>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <label>
        Search notes and bookmarks
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="tools-grid">
        <section className="panel">
          <h2>Saved material</h2>
          {bookmarks
            .filter((b) => b.title.toLowerCase().includes(query.toLowerCase()))
            .map((b) => {
              const card = sets
                .find((s) => s.id === b.setId)
                ?.cards.find((c) => c.id === b.sourceId);
              const q = banks.find((q) => q.id === b.sourceId);
              return (
                <details className="saved-material" key={b.id}>
                  <summary>{b.title}</summary>
                  <p>
                    <MathText
                      text={
                        card?.definition ||
                        q?.options[q.correct] ||
                        "This material has been removed from the library."
                      }
                    />
                  </p>
                  {card?.notes && <p>{card.notes}</p>}
                  <button
                    className="secondary"
                    onClick={() => void run(() => db.bookmarks.delete(b.id))}
                  >
                    Remove bookmark
                  </button>
                </details>
              );
            })}
          {!bookmarks.length && (
            <p>
              Bookmark a flashcard while studying or save a question from its
              bank.
            </p>
          )}
        </section>
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await db.notes.put({ ...draft, updated: Date.now() });
              setDraft({
                id: uid(),
                title: "",
                body: "",
                topic: "",
                setId: "",
                updated: Date.now(),
              });
            });
          }}
        >
          <h2>Write a note</h2>
          <label>
            Note title
            <input
              required
              value={draft.title}
              maxLength={200}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label>
            Topic
            <input
              value={draft.topic}
              onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
            />
          </label>
          <label>
            Link to set
            <select
              aria-label="Link to set"
              value={draft.setId}
              onChange={(e) => setDraft({ ...draft, setId: e.target.value })}
            >
              <option value="">No linked set</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Note content
            <textarea
              aria-label="Note content"
              required
              maxLength={100000}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          </label>
          <button className="primary">Save note</button>
        </form>
      </div>
      <div className="bank-list">
        {notes
          .filter((n) =>
            `${n.title} ${n.body} ${n.topic}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((n) => (
            <article className="panel" key={n.id}>
              <span className="pill">{n.topic || "Personal note"}</span>
              <h2>{n.title}</h2>
              <p>
                <MathText text={n.body} />
              </p>
              <small>{sets.find((s) => s.id === n.setId)?.title}</small>
              <div className="button-row">
                <button className="secondary" onClick={() => setDraft(n)}>
                  Edit note
                </button>
                <button
                  className="danger-text"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Delete this note? Export a backup first if needed.",
                      )
                    )
                      void run(() => db.notes.delete(n.id));
                  }}
                >
                  Delete note
                </button>
              </div>
            </article>
          ))}
      </div>
    </div>
  );
}
export function ReviewQueue({
  sets,
  open,
}: {
  sets: StudySet[];
  open: (s: StudySet) => void;
}) {
  const sorted = sets
    .map((s) => ({
      s,
      due: s.cards.filter((c) => c.due <= Date.now()).length,
      weak: s.cards.filter((c) => c.status === "learning").length,
    }))
    .sort((a, b) => b.weak - a.weak || b.due - a.due);
  return (
    <div className="platform-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE RIGHT REVIEW, AT THE RIGHT TIME</div>
          <h1>Spaced repetition</h1>
          <p>Prioritize due cards and material you are still learning.</p>
        </div>
      </div>
      <section className="panel">
        <h2>{sorted.reduce((n, x) => n + x.due, 0)} cards due now</h2>
        <p>
          Simplified SM-2: successful recalls schedule 1 day, then 6 days, then
          the previous interval × ease. Failure lowers ease and resets the
          interval to 1 day. These are practice recommendations, not guarantees
          of retention.
        </p>
      </section>
      {sorted.map(({ s, due, weak }) => (
        <section className="panel recommendation" key={s.id}>
          <div>
            <h2>{s.title}</h2>
            <p>
              {due} due · {weak} still learning ·{" "}
              {s.cards.filter((c) => c.status === "known").length} last recalled
              correctly
            </p>
          </div>
          <button className="primary" onClick={() => open(s)}>
            Review due cards
          </button>
        </section>
      ))}
      {!sets.length && (
        <div className="empty">
          <h2>Your next review starts with a set.</h2>
          <p>Create a study set in My Library.</p>
        </div>
      )}
    </div>
  );
}
export function Matching({ sets }: { sets: StudySet[] }) {
  const [setId, setSetId] = useState(sets[0]?.id || "");
  const [pairs, setPairs] = useState<
    { id: string; term: string; definition: string }[]
  >([]);
  const [right, setRight] = useState<string[]>([]);
  const [left, setLeft] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [message, setMessage] = useState("");
  const [started, setStarted] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  function start() {
    const cards = sets.find((s) => s.id === setId)?.cards || [];
    const seen = new Set<string>();
    const pool = shuffle(cards)
      .filter((c) => {
        const key = c.definition.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);
    setPairs(pool);
    setRight(shuffle(pool.map((c) => c.id)));
    setMatched([]);
    setMistakes(0);
    setLeft(null);
    setStarted(Date.now());
    setElapsed(0);
    setMessage("Choose a term, then its definition.");
  }
  async function choose(id: string) {
    if (!left) return;
    if (left !== id) {
      setMistakes((n) => n + 1);
      setMessage("Not a match. Try again.");
      setLeft(null);
      return;
    }
    const next = [...matched, id];
    setMatched(next);
    setLeft(null);
    setMessage("Matched!");
    if (next.length === pairs.length) {
      const seconds = (Date.now() - started) / 1000;
      setElapsed(seconds);
      try {
        await db.sessions.add({
          id: uid(),
          setId,
          title: sets.find((s) => s.id === setId)?.title || "Matching",
          mode: "Matching",
          date: Date.now(),
          correct: pairs.length,
          total: pairs.length + mistakes,
        });
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }
  return (
    <div className="platform-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE THE CONNECTION</div>
          <h1>Matching game</h1>
          <p>Match up to six terms with their definitions.</p>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="panel">
        <label>
          Study set
          <select
            aria-label="Study set"
            value={setId}
            onChange={(e) => setSetId(e.target.value)}
          >
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={!sets.length} onClick={start}>
          Start matching
        </button>
      </div>
      {pairs.length > 0 && (
        <>
          <p role="status">{message}</p>
          <div className="match-grid">
            <div>
              {pairs.map((c) => (
                <button
                  className="secondary"
                  disabled={matched.includes(c.id)}
                  aria-pressed={left === c.id}
                  key={c.id}
                  onClick={() => setLeft(c.id)}
                >
                  <MathText text={c.term} />
                  {matched.includes(c.id) ? " ✓" : ""}
                </button>
              ))}
            </div>
            <div>
              {right.map((id) => {
                const c = pairs.find((c) => c.id === id)!;
                return (
                  <button
                    className="secondary"
                    disabled={matched.includes(id) || !left}
                    key={id}
                    onClick={() => void choose(id)}
                  >
                    <MathText text={c.definition} />
                    {matched.includes(id) ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
          </div>
          <p>
            {matched.length}/{pairs.length} matched · {mistakes} incorrect
            selections
          </p>
          {matched.length === pairs.length && (
            <section className="panel">
              <h2>All connected.</h2>
              <p>
                {elapsed.toFixed(1)} seconds ·{" "}
                {Math.round((pairs.length / (pairs.length + mistakes)) * 100)}%
                accuracy. Result saved.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
