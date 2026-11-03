import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, recordSession } from "./db";
import { shuffle, type StudySet } from "./domain";
import {
  cardQuestions,
  correctAnswer,
  fromBank,
  mistakeIds,
  weakFirst,
  type Attempt,
  type Draft,
  type LearningQuestion,
} from "./platform";
import { MathText } from "./MathText";
export function Practice({
  exam = false,
  sets,
}: {
  exam?: boolean;
  sets: StudySet[];
}) {
  const banks = useLiveQuery(() => db.banks.toArray()) || [];
  const attempts =
    useLiveQuery(() => db.attempts.orderBy("date").reverse().toArray()) || [];
  const saved = useLiveQuery(() => db.drafts.get(exam ? "exam" : "practice"));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [result, setResult] = useState<Attempt | null>(null);
  const [selected, setSelected] = useState(sets.map((s) => s.id));
  const [bank, setBank] = useState("*");
  const [source, setSource] = useState("both");
  const [count, setCount] = useState(10);
  const [minutes, setMinutes] = useState(20);
  const [type, setType] = useState<
    "multiple" | "written" | "boolean" | "mixed"
  >("multiple");
  const [options, setOptions] = useState(4);
  const [difficulty, setDifficulty] = useState("all");
  const [strategy, setStrategy] = useState("adaptive");
  const [explanations, setExplanations] = useState(true);
  const [immediate, setImmediate] = useState(!exam);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [hint, setHint] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const current = useRef(draft);
  current.current = draft;
  const writes = useRef(Promise.resolve());
  const draftKey = exam ? "exam" : "practice";
  async function persist(d: Draft | null) {
    if (d) {
      writes.current = writes.current
        .then(async () => {
          await db.drafts.put(d);
        })
        .catch((e) => setError(`Could not save session: ${e.message}`));
      await writes.current;
    }
  }
  function change(d: Draft) {
    setDraft(d);
    void persist(d);
  }
  async function start(pool?: LearningQuestion[]) {
    setError("");
    setResult(null);
    setFeedback(null);
    setHint(false);
    try {
      const cards =
        source === "banks"
          ? []
          : cardQuestions(
              sets.filter((s) => selected.includes(s.id)),
              type === "mixed" ? ["multiple", "written", "boolean"] : type,
              options,
            );
      let all = pool || [
        ...cards,
        ...(source === "cards"
          ? []
          : banks.filter((q) => bank === "*" || q.bank === bank).map(fromBank)),
      ];
      if (!pool) {
        all = all.filter(
          (q) => difficulty === "all" || q.difficulty === difficulty,
        );
        if (strategy === "mistakes") {
          const ids = mistakeIds(attempts);
          all = all.filter((q) => ids.has(q.id));
        }
        all =
          strategy === "adaptive"
            ? weakFirst(all, attempts, sets)
            : shuffle(all);
        all = all.slice(0, count);
      }
      if (!all.length)
        throw new Error(
          "No questions match. Select study sets or create a question bank, or change the filters.",
        );
      const d: Draft = {
        id: draftKey,
        mode: exam ? "Exam" : "Practice",
        started: Date.now(),
        deadline: exam && minutes > 0 ? Date.now() + minutes * 60000 : null,
        questions: all,
        answers: {},
        flags: [],
        index: 0,
        explanations,
        immediate,
      };
      await persist(d);
      setDraft(d);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function finish() {
    const d = current.current;
    if (!d || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await writes.current;
      const attempt: Attempt = {
        id: `attempt:${d.mode}:${d.started}`,
        mode: d.mode,
        date: Date.now(),
        duration: Math.max(
          0,
          (Math.min(Date.now(), d.deadline ?? Infinity) - d.started) / 1000,
        ),
        questions: d.questions,
        answers: d.answers,
        correct: d.questions.filter((q, i) =>
          correctAnswer(q, d.answers[i] || ""),
        ).length,
      };
      const savedAttempt = await db.transaction(
        "rw",
        [db.sets, db.sessions, db.reviews, db.attempts, db.drafts],
        async () => {
          const existing = await db.attempts.get(attempt.id);
          if (existing) return existing;
          for (const setId of new Set(
            d.questions.filter((q) => q.source === "card").map((q) => q.setId),
          )) {
            const liveSet = await db.sets.get(setId);
            if (liveSet)
              await recordSession(
                setId,
                d.mode,
                d.questions.flatMap((q, i) =>
                  q.setId === setId &&
                  liveSet.cards.some((c) => c.id === q.cardId)
                    ? [
                        {
                          cardId: q.cardId,
                          known: correctAnswer(q, d.answers[i] || ""),
                        },
                      ]
                    : [],
                ),
              );
          }
          await db.attempts.add(attempt);
          await db.drafts.delete(draftKey);
          return attempt;
        },
      );
      setResult(savedAttempt);
      setDraft(null);
      setFeedback(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  useEffect(() => {
    if (!draft) return;
    const t = setInterval(() => {
      setNow(Date.now());
      const d = current.current;
      if (d?.deadline && Date.now() >= d.deadline) void finish();
    }, 500);
    return () => clearInterval(t);
  }, [!!draft]);
  const q = draft?.questions[draft.index];
  const questionHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [draft?.started, result?.id]);
  useEffect(() => {
    questionHeading.current?.focus({ preventScroll: true });
  }, [q?.id]);
  function answer(value: string) {
    if (!draft || feedback !== null || busy || submitting.current) return;
    if (draft.deadline && Date.now() >= draft.deadline) {
      void finish();
      return;
    }
    change({ ...draft, answers: { ...draft.answers, [draft.index]: value } });
    if (draft.immediate && q?.options.length)
      setFeedback(correctAnswer(q, value));
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !q?.options.length ||
        feedback !== null ||
        !draft ||
        busy ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true]",
        ) ||
        document.querySelector("dialog[open]")
      )
        return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < q.options.length) {
        e.preventDefault();
        answer(q.options[i]);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [q, draft, feedback, busy]);
  function move(index: number) {
    if (draft) {
      change({ ...draft, index });
      setFeedback(
        draft.immediate && draft.answers[index] !== undefined
          ? correctAnswer(draft.questions[index], draft.answers[index])
          : null,
      );
      setHint(false);
    }
  }
  return (
    <div className="platform-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {exam ? "KNOW WHERE YOU STAND" : "BUILD LASTING KNOWLEDGE"}
          </div>
          <h1>{exam ? "Exams" : "Practice studio"}</h1>
          <p>
            {exam
              ? "Set a challenge. Review every answer."
              : "Target weak material with focused, adaptive practice."}
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {draft && q ? (
        <>
          <div className="session-strip">
            <strong>
              {draft.mode} · {draft.index + 1} / {draft.questions.length}
            </strong>
            <span>{Object.keys(draft.answers).length} answered</span>
            {draft.deadline && (
              <strong role="timer" aria-label="Time remaining">
                {Math.floor(Math.max(0, draft.deadline - now) / 60000)}:
                {String(
                  Math.floor(Math.max(0, draft.deadline - now) / 1000) % 60,
                ).padStart(2, "0")}
              </strong>
            )}
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                void persist(draft).then(() => setDraft(null));
              }}
            >
              Save & exit
            </button>
          </div>
          <progress
            aria-label="Session progress"
            value={Object.keys(draft.answers).length}
            max={draft.questions.length}
          />
          <section className="mcq-stage" aria-label="Practice question">
            <div className="question-counter">
              {q.category || "Study question"} · {q.difficulty}
            </div>
            <h2 tabIndex={-1} ref={questionHeading}>
              <MathText text={q.prompt} />
            </h2>
            {q.options.length ? (
              <>
                <p>Choose an answer</p>
                <div className="mcq-options">
                  {q.options.map((o, i) => (
                    <button
                      key={o}
                      disabled={busy || feedback !== null}
                      aria-pressed={draft.answers[draft.index] === o}
                      className={
                        feedback !== null && correctAnswer(q, o)
                          ? "correct"
                          : feedback === false &&
                              draft.answers[draft.index] === o
                            ? "incorrect"
                            : draft.answers[draft.index] === o
                              ? "selected"
                              : ""
                      }
                      onClick={() => answer(o)}
                    >
                      <span>{i + 1}</span>
                      <MathText text={o} />
                    </button>
                  ))}
                </div>
                <small>Use keys 1–{q.options.length} to choose.</small>
              </>
            ) : (
              <label>
                Your answer
                <input
                  aria-label="Your answer"
                  autoComplete="off"
                  value={draft.answers[draft.index] || ""}
                  disabled={busy || feedback !== null}
                  onChange={(e) => answer(e.target.value)}
                />
                <small>
                  {q.checking === "exact"
                    ? "Exact text required."
                    : "Case and extra whitespace are ignored; authored alternatives are accepted."}
                </small>
              </label>
            )}
            {draft.immediate && !q.options.length && feedback === null && (
              <button
                className="secondary"
                disabled={!draft.answers[draft.index]?.trim()}
                onClick={() =>
                  setFeedback(
                    correctAnswer(q, draft.answers[draft.index] || ""),
                  )
                }
              >
                Check answer
              </button>
            )}
            {!exam && q.hint && (
              <button className="secondary" onClick={() => setHint(!hint)}>
                Show hint
              </button>
            )}
            {hint && <p>{q.hint}</p>}
            {feedback !== null && (
              <div
                className={
                  "mcq-feedback " + (feedback ? "correct" : "incorrect")
                }
                role="status"
              >
                <strong>{feedback ? "Correct!" : "Keep practicing."}</strong>
                {!feedback && (
                  <p>
                    Correct answer: <MathText text={q.answer} />
                  </p>
                )}
                {draft.explanations && q.explanation && (
                  <p>
                    <MathText text={q.explanation} />
                  </p>
                )}
              </div>
            )}
          </section>
          <div className="button-row">
            <button
              className="secondary"
              disabled={!draft.index || busy}
              onClick={() => move(draft.index - 1)}
            >
              Previous question
            </button>
            <button
              className="secondary"
              aria-pressed={draft.flags.includes(draft.index)}
              onClick={() =>
                change({
                  ...draft,
                  flags: draft.flags.includes(draft.index)
                    ? draft.flags.filter((i) => i !== draft.index)
                    : [...draft.flags, draft.index],
                })
              }
            >
              {draft.flags.includes(draft.index)
                ? "Unflag question"
                : "Flag for review"}
            </button>
            {draft.index < draft.questions.length - 1 && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => move(draft.index + 1)}
              >
                Next question
              </button>
            )}
            <button
              className="primary"
              disabled={busy}
              onClick={() => void finish()}
            >
              {busy ? "Saving…" : exam ? "Submit exam" : "Finish practice"}
            </button>
          </div>
          <nav className="question-nav" aria-label="Question navigation">
            {draft.questions.map((_, i) => (
              <button
                className="secondary"
                key={i}
                aria-label={`Question ${i + 1}${draft.flags.includes(i) ? ", flagged" : ""}${draft.answers[i] !== undefined ? ", answered" : ""}`}
                aria-current={i === draft.index ? "step" : undefined}
                onClick={() => move(i)}
              >
                {i + 1}
                {draft.flags.includes(i) ? " ⚑" : ""}
                {draft.answers[i] !== undefined ? " ✓" : ""}
              </button>
            ))}
          </nav>
          <p className="muted">
            Saved on this device. Unanswered questions count as incorrect.{" "}
            {draft.immediate
              ? "Feedback is enabled."
              : "Answers stay hidden until submission."}{" "}
            AI tutor is unavailable during this session.
          </p>
        </>
      ) : result ? (
        <>
          <section className="panel result-panel">
            <span className="result-score">
              {Math.round((result.correct / result.questions.length) * 100)}
              <small>%</small>
            </span>
            <h2>Session complete</h2>
            <p>
              {result.correct} of {result.questions.length} correct ·{" "}
              {Math.round(result.duration)} seconds
            </p>
            <div className="button-row">
              <button
                className="primary"
                onClick={() => {
                  setResult(null);
                }}
              >
                New session
              </button>
              <button
                className="secondary"
                onClick={() =>
                  void start(
                    result.questions.map((q) => ({
                      ...q,
                      options: shuffle(q.options),
                    })),
                  )
                }
              >
                Retake session
              </button>
              {result.correct < result.questions.length && (
                <button
                  className="secondary"
                  onClick={() =>
                    void start(
                      result.questions.filter(
                        (q, i) => !correctAnswer(q, result.answers[i] || ""),
                      ),
                    )
                  }
                >
                  Retry incorrect answers
                </button>
              )}
            </div>
          </section>
          {result.questions.map((q, i) => (
            <section className="panel answer-review" key={i}>
              <div>
                <span className="pill">
                  {correctAnswer(q, result.answers[i] || "")
                    ? "Correct"
                    : "Incorrect"}
                </span>
                <h2>
                  <MathText text={q.prompt} />
                </h2>
                <p>Your answer: {result.answers[i] || "Unanswered"}</p>
                <p>
                  Correct answer: <MathText text={q.answer} />
                </p>
                {explanations && q.explanation && (
                  <p>
                    <MathText text={q.explanation} />
                  </p>
                )}
              </div>
            </section>
          ))}
        </>
      ) : (
        <>
          {saved && (
            <section className="panel resume-panel">
              <h2>Continue your saved {saved.mode.toLowerCase()}</h2>
              <p>
                {Object.keys(saved.answers).length} answers saved.{" "}
                {saved.deadline ? "The exam timer continues while away." : ""}
              </p>
              <button
                className="primary"
                onClick={() => {
                  setDraft(saved);
                  setFeedback(
                    saved.immediate && saved.answers[saved.index] !== undefined
                      ? correctAnswer(
                          saved.questions[saved.index],
                          saved.answers[saved.index],
                        )
                      : null,
                  );
                  setNow(Date.now());
                }}
              >
                Resume session
              </button>
              <button
                className="secondary"
                onClick={() => void db.drafts.delete(draftKey)}
              >
                Discard saved session
              </button>
            </section>
          )}
          <section className="panel exam-config">
            <h2>{exam ? "Build your exam" : "Choose your focus"}</h2>
            <div className="two-col">
              <label>
                Question source
                <select
                  aria-label="Question source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="both">Flashcards + question banks</option>
                  <option value="cards">Flashcards</option>
                  <option value="banks">Question banks</option>
                </select>
              </label>
              <label>
                Question bank
                <select
                  aria-label="Question bank"
                  value={bank}
                  onChange={(e) => setBank(e.target.value)}
                >
                  <option value="*">All banks</option>
                  {[...new Set(banks.map((q) => q.bank))].map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
            </div>
            {source !== "banks" && (
              <fieldset>
                <legend>Study sets</legend>
                {sets.length ? (
                  sets.map((s) => (
                    <label className="check-label" key={s.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(s.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, s.id]
                              : selected.filter((id) => id !== s.id),
                          )
                        }
                      />
                      {s.title}
                    </label>
                  ))
                ) : (
                  <p>Create a study set or use a question bank.</p>
                )}
              </fieldset>
            )}
            <div className="two-col">
              <label>
                Question count
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={count}
                  onChange={(e) =>
                    setCount(
                      Math.min(200, Math.max(1, Number(e.target.value) || 1)),
                    )
                  }
                />
              </label>
              <label>
                Difficulty
                <select
                  aria-label="Difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  <option value="all">All difficulties</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label>
                Flashcard question format
                <select
                  aria-label="Flashcard question format"
                  value={type}
                  onChange={(e) => setType(e.target.value as typeof type)}
                >
                  <option value="multiple">Multiple choice</option>
                  <option value="written">Fill in the blank / written</option>
                  <option value="boolean">True or false</option>
                  <option value="mixed">Mixed formats</option>
                </select>
              </label>
              <label>
                Generated answer options
                <select
                  aria-label="Generated answer options"
                  value={options}
                  onChange={(e) => setOptions(Number(e.target.value))}
                >
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Question order
                <select
                  aria-label="Question order"
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                >
                  <option value="adaptive">
                    Adaptive · weaker material first
                  </option>
                  <option value="random">Shuffled</option>
                  <option value="mistakes">Mistake review only</option>
                </select>
              </label>
              {exam && (
                <label>
                  Time limit in minutes · 0 = untimed
                  <input
                    type="number"
                    min={0}
                    max={240}
                    value={minutes}
                    onChange={(e) =>
                      setMinutes(
                        Math.min(240, Math.max(0, Number(e.target.value) || 0)),
                      )
                    }
                  />
                </label>
              )}
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={immediate}
                onChange={(e) => setImmediate(e.target.checked)}
              />
              Show immediate feedback
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={explanations}
                onChange={(e) => setExplanations(e.target.checked)}
              />
              Show explanations
            </label>
            <p className="muted">
              Generated choices come only from distinct answers in the same set.
              Fewer valid choices are shown when needed; one-answer sets use
              written questions. Available matching questions cap the session
              length.
            </p>
            <button
              className="primary"
              disabled={!!saved}
              onClick={() => void start()}
            >
              {exam ? "Start exam" : "Start practice"}
            </button>
          </section>
          <section className="panel history">
            <h2>Previous {exam ? "exams" : "practice sessions"}</h2>
            {attempts.filter((a) => a.mode === (exam ? "Exam" : "Practice"))
              .length ? (
              attempts
                .filter((a) => a.mode === (exam ? "Exam" : "Practice"))
                .map((a) => (
                  <div className="attempt-row" key={a.id}>
                    <span>
                      {new Date(a.date).toLocaleString()} · {a.correct}/
                      {a.questions.length} · {Math.round(a.duration)}s
                    </span>
                    <button className="secondary" onClick={() => setResult(a)}>
                      Review attempt
                    </button>
                  </div>
                ))
            ) : (
              <p>Your completed sessions will appear here.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
