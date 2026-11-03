import { Tutor } from "./Tutor";
import { useState, useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Layers,
  Brain,
  GraduationCap,
  Shuffle,
  RotateCcw,
  Check,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  X,
} from "lucide-react";
import { db, recordSession } from "./db";
import {
  type StudySet,
  type Question,
  type QuestionType,
  uid,
  review,
  questions,
  grade,
  shuffle,
} from "./domain";
import { MathText } from "./MathText";
export function Study({
  set: s,
  onBack,
  run,
}: {
  set: StudySet;
  onBack: () => void;
  run: (a: () => Promise<unknown>, message?: string) => Promise<void>;
}) {
  const [mode, setMode] = useState("Flashcards");
  const [tutorReview, setTutorReview] = useState(0);
  const [tutorRequest, setTutorRequest] = useState(0);
  const [filter, setFilter] = useState("all");
  const [membership, setMembership] = useState(s.cards.map((c) => c.id));
  const [order, setOrder] = useState(s.cards.map((c) => c.id));
  const [index, setIndex] = useState(0);
  const [flip, setFlip] = useState(false);
  const [round, setRound] = useState(0);
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(Math.min(10, s.cards.length));
  const [types, setTypes] = useState<QuestionType[]>([
    "multiple",
    "written",
    "boolean",
  ]);
  const [quiz, setQuiz] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [retries, setRetries] = useState<Question[]>([]);
  const area = useRef<HTMLDivElement>(null);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const expanded = nativeFullscreen || focusMode;
  const frontFace = useRef<HTMLDivElement>(null);
  const backFace = useRef<HTMLDivElement>(null);
  const ids = order.filter((id) => membership.includes(id));
  const card = s.cards.find(
    (c) => c.id === ids[Math.min(index, ids.length - 1)],
  );
  useEffect(() => {
    frontFace.current?.scrollTo(0, 0);
    backFace.current?.scrollTo(0, 0);
    if (
      document.activeElement === frontFace.current ||
      document.activeElement === backFace.current
    ) {
      (flip ? backFace.current : frontFace.current)?.focus({
        preventScroll: true,
      });
    }
  }, [card?.id, flip, round]);
  useEffect(() => {
    const changed = () =>
      setNativeFullscreen(document.fullscreenElement === area.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useEffect(() => {
    if (!focusMode) return;
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const keepFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusMode(false);
      if (event.key !== "Tab") return;
      const controls = Array.from(
        area.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),select:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ) ?? [],
      ).filter(
        (element) =>
          element.getClientRects().length &&
          !element.closest('[aria-hidden="true"]'),
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !area.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !area.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", keepFocus);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", keepFocus);
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [focusMode]);
  const toggleFullscreen = async () => {
    if (document.fullscreenElement === area.current) {
      await document.exitFullscreen();
    } else if (focusMode) {
      setFocusMode(false);
    } else {
      try {
        if (!document.fullscreenEnabled || !area.current?.requestFullscreen) {
          setFocusMode(true);
          return;
        }
        await area.current.requestFullscreen();
      } catch {
        // Browsers without native fullscreen still get a full-window focus view.
        setFocusMode(true);
      }
    }
  };
  const fullscreenButton = (
    <button
      className="secondary fullscreen-toggle"
      aria-pressed={expanded}
      onClick={() => void run(toggleFullscreen)}
    >
      {expanded ? <Minimize size={17} /> : <Maximize size={17} />}
      {expanded ? "Exit full screen" : "Full screen"}
    </button>
  );
  const move = (delta: number) => {
    setIndex((i) => Math.max(0, Math.min(ids.length - 1, i + delta)));
    setFlip(false);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        mode !== "Flashcards" ||
        (e.target as HTMLElement).matches("input,textarea,select") ||
        (e.target as HTMLElement).closest(".tutor-panel") ||
        document.querySelector("dialog[open]")
      )
        return;
      if (e.code === "Space" && !(e.target as HTMLElement).closest("button")) {
        e.preventDefault();
        setFlip((f) => !f);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        move(1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        move(-1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [mode, ids.length]);
  const startQuiz = (retry?: Question[]) => {
    setQuiz(
      retry ||
        questions(s.cards, mode === "Learn" ? s.cards.length : count, types),
    );
    setAnswers({});
    setIndex(0);
    setSubmitted(false);
    setTutorReview(0);
    setFeedback(null);
    setRetries([]);
  };
  const reset = () => {
    setIndex(0);
    setFlip(false);
    setSeen({});
    setFinished(false);
    setQuiz(null);
    setAnswers({});
    setSubmitted(false);
    setFeedback(null);
    setRetries([]);
    setRound((r) => r + 1);
  };
  const rate = async (known: boolean) => {
    if (!card || busy) return;
    setBusy(true);
    await run(async () => {
      const now = Date.now();
      await db.transaction("rw", db.sets, db.reviews, async () => {
        const current = await db.sets.get(s.id);
        if (!current) throw new Error("Set no longer exists.");
        const original = current.cards.find((c) => c.id === card.id);
        if (!original) throw new Error("Card no longer exists.");
        const rated = review(original, known, now);
        await db.sets.put({
          ...current,
          lastStudied: now,
          cards: current.cards.map((c) => (c.id === card.id ? rated : c)),
        });
        await db.reviews.add({
          id: uid(),
          setId: s.id,
          cardId: card.id,
          term: card.term,
          date: now,
          known,
          interval: rated.interval,
          mode: "Flashcards",
        });
      });
      setSeen((v) => ({ ...v, [card.id]: known }));
      if (index < ids.length - 1) move(1);
    });
    setBusy(false);
  };
  const finishCards = async () => {
    setBusy(true);
    await run(async () => {
      await db.sessions.add({
        id: uid(),
        setId: s.id,
        title: s.title,
        mode: "Flashcards",
        date: Date.now(),
        correct: Object.values(seen).filter(Boolean).length,
        total: Object.keys(seen).length,
      });
      setFinished(true);
    }, "Session saved");
    setBusy(false);
  };
  const submit = async () => {
    if (!quiz) return;
    setBusy(true);
    await run(async () => {
      await recordSession(
        s.id,
        mode,
        quiz.map((q, i) => ({
          cardId: q.cardId,
          known: grade(answers[i] || "", q.answer),
        })),
      );
      setSubmitted(true);
      setRetries(quiz.filter((q, i) => !grade(answers[i] || "", q.answer)));
    }, "Session saved");
    setBusy(false);
  };
  const q = quiz?.[index];
  const tutorQuestion = submitted ? quiz?.[tutorReview] : q;
  const tutorCard = mode === "Flashcards" ? card : s.cards.find(c => c.id === tutorQuestion?.cardId);
  const tutor = tutorCard && !finished && (mode === "Flashcards" || (quiz && (mode === "Learn" || submitted))) && (
        <Tutor set={s} card={tutorCard} question={mode === "Flashcards" ? undefined : tutorQuestion}
          revealed={mode === "Flashcards" ? flip : submitted || feedback !== null}
          selectedAnswer={answers[submitted ? tutorReview : index] || ""}
          requestOpen={tutorRequest}
          onReveal={mode === "Flashcards" ? () => setFlip(true) : !submitted && feedback === null ? () => {
            setAnswers(a => ({ ...a, [index]: "" }));
            setFeedback(false);
            if (q && quiz && quiz.filter(item => item.cardId === q.cardId).length < 2)
              setQuiz([...quiz, { ...q, options: shuffle(q.options) }]);
          } : undefined}
        />
      );
  const score =
    quiz?.filter((q, i) => grade(answers[i] || "", q.answer)).length || 0;
  return (
    <div
      className={`study-area ${expanded ? "expanded" : ""} ${focusMode ? "focus-mode" : ""}`}
      ref={area}
      role={focusMode ? "dialog" : undefined}
      aria-modal={focusMode || undefined}
      aria-label={focusMode ? `Study ${s.title}` : undefined}
    >
      <button className="text-button back" onClick={onBack}>
        <ChevronLeft size={16} />
        All study sets
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR FOCUS SPACE</div>
          <h1>{s.title}</h1>
          <p>
            {s.description ||
              `${s.cards.length} cards. A little closer to knowing.`}
          </p>
        </div>
        {mode !== "Flashcards" && fullscreenButton}
      </div>
      <div className="study-tabs">
        {[
          { name: "Flashcards", icon: Layers },
          { name: "Learn", icon: Brain },
          { name: "Test", icon: GraduationCap },
        ].map(({ name, icon: Icon }) => (
          <button
            className={mode === name ? "selected" : ""}
            key={name}
            onClick={() => {
              setMode(name);
              reset();
            }}
          >
            <Icon size={18} />
            {name}
          </button>
        ))}
      </div>
      {mode === "Flashcards" ? (
        <div className="flashcard-session">
          <div className="study-toolbar">
            <span>{Object.keys(seen).length} reviewed this session</span>
            <select
              aria-label="Filter cards"
              value={filter}
              onChange={(e) => {
                const value = e.target.value;
                setFilter(value);
                setMembership(
                  s.cards
                    .filter(
                      (c) =>
                        value === "all" ||
                        (value === "due" && c.due <= Date.now()) ||
                        c.status === value,
                    )
                    .map((c) => c.id),
                );
                setIndex(0);
                setFlip(false);
              }}
            >
              <option value="all">All cards</option>
              <option value="due">Due for review</option>
              <option value="new">New cards</option>
              <option value="learning">Still learning</option>
              <option value="known">Known cards</option>
            </select>
            {mode === "Flashcards" && tutor}
            <button
              className="secondary shuffle-control"
              aria-label="Shuffle cards"
              onClick={() => {
                setOrder(shuffle(order));
                setIndex(0);
                setFlip(false);
              }}
            >
              <Shuffle size={16} />
              <span>Shuffle</span>
            </button>
            {fullscreenButton}
            <button
              className="icon-button"
              aria-label="Restart session"
              onClick={reset}
            >
              <RotateCcw size={18} />
            </button>
          </div>
          {finished ? (
            <div className="result-panel panel">
              <CheckCircle2 size={42} />
              <h2>A little more confident.</h2>
              <p>
                You reviewed {Object.keys(seen).length} cards. Your progress is
                saved.
              </p>
              <button className="primary" onClick={reset}>
                Study again
              </button>
            </div>
          ) : card ? (
            <div className="card-stage">
              <div
                className={`flashcard ${flip ? "flipped" : ""}`}
                onClick={(event) => {
                  // Selecting text or dragging a scroll bar should not flip the card.
                  if (window.getSelection()?.toString()) return;
                  let target = event.target as HTMLElement | null;
                  while (target && target !== event.currentTarget) {
                    if (
                      target.scrollHeight > target.clientHeight ||
                      target.scrollWidth > target.clientWidth
                    ) {
                      const bounds = target.getBoundingClientRect();
                      if (
                        event.clientX >=
                          bounds.left +
                            target.clientLeft +
                            target.clientWidth ||
                        event.clientY >=
                          bounds.top + target.clientTop + target.clientHeight
                      )
                        return;
                    }
                    target = target.parentElement;
                  }
                  setFlip(!flip);
                }}
              >
                <div className="flashcard-inner">
                  <div
                    className={`card-face ${card.term.length > 180 ? "long-content" : ""}`}
                    ref={frontFace}
                    role="region"
                    aria-label="Flashcard term"
                    tabIndex={flip ? -1 : 0}
                    aria-hidden={flip}
                  >
                    <small>TERM</small>
                    <strong>
                      <MathText text={card.term} />
                    </strong>
                    <span>
                      Click or press Space to flip <RotateCcw size={13} />
                    </span>
                  </div>
                  <div
                    className={`card-face card-back ${card.definition.length > 240 ? "long-content" : ""}`}
                    ref={backFace}
                    role="region"
                    aria-label="Flashcard definition"
                    tabIndex={flip ? 0 : -1}
                    aria-hidden={!flip}
                  >
                    <small>DEFINITION</small>
                    <strong>
                      <MathText text={card.definition} />
                    </strong>
                    {card.notes && (
                      <em>
                        <MathText text={card.notes} />
                      </em>
                    )}
                    <span>Click to see the term</span>
                  </div>
                </div>
              </div>
              <div className="flash-navigation">
                <button
                  className="circle-button"
                  aria-label="Previous card"
                  disabled={index === 0}
                  onClick={() => move(-1)}
                >
                  <ChevronLeft size={20} />
                </button>
                <strong>
                  {Math.min(index + 1, ids.length)} <span>/ {ids.length}</span>
                </strong>
                <button
                  className="secondary flip-control"
                  aria-label="Flip flashcard"
                  onClick={() => setFlip(!flip)}
                >
                  <RotateCcw size={15} />
                  Flip card
                </button>
                <button
                  className="circle-button"
                  aria-label="Next card"
                  disabled={index >= ids.length - 1}
                  onClick={() => move(1)}
                >
                  <ChevronRight size={20} />
                </button>
              </div>
              <div className="rating-buttons">
                <button
                  className="secondary learning"
                  disabled={busy}
                  onClick={() => void rate(false)}
                >
                  <RotateCcw size={17} />
                  Still learning
                </button>
                <button
                  className="secondary known"
                  disabled={busy}
                  onClick={() => void rate(true)}
                >
                  <Check size={18} />I know this
                </button>
              </div>
              <div className="progress-track session-progress">
                <span
                  style={{
                    width: `${(Object.keys(seen).length / s.cards.length) * 100}%`,
                  }}
                />
              </div>
              <button
                className="text-button finish-session"
                disabled={busy || !Object.keys(seen).length}
                onClick={() => void finishCards()}
              >
                Finish session <CheckCircle2 size={16} />
              </button>
            </div>
          ) : (
            <div className="empty">
              <BookOpen size={32} />
              <h2>You’re all caught up.</h2>
              <p>
                No cards match this filter. Try all cards to keep practicing.
              </p>
            </div>
          )}
        </div>
      ) : !quiz ? (
        <section className="panel quiz-config">
          <span className="empty-icon">
            <Brain size={32} />
          </span>
          <h2>
            {mode === "Learn"
              ? "Let’s make it stick."
              : "Put your knowledge to the test."}
          </h2>
          <p>
            {mode === "Learn"
              ? "Get immediate feedback, then give difficult cards another try."
              : "Build a practice test and see what you remember."}
          </p>
          {mode === "Test" && (
            <label>
              Number of questions
              <input
                aria-label="Number of questions"
                type="number"
                min={1}
                max={s.cards.length}
                value={count}
                onChange={(e) =>
                  setCount(
                    Math.max(
                      1,
                      Math.min(s.cards.length, Number(e.target.value) || 1),
                    ),
                  )
                }
              />
            </label>
          )}
          <fieldset>
            <legend>Question types</legend>
            {(["multiple", "written", "boolean"] as QuestionType[]).map((t) => (
              <label className="check-label" key={t}>
                <input
                  type="checkbox"
                  checked={types.includes(t)}
                  onChange={(e) =>
                    setTypes((v) =>
                      e.target.checked ? [...v, t] : v.filter((x) => x !== t),
                    )
                  }
                />
                {t === "multiple"
                  ? "Multiple choice"
                  : t === "written"
                    ? "Written answer"
                    : "True or false"}
              </label>
            ))}
          </fieldset>
          <p className="muted">
            Sets with only one distinct definition use written questions.
          </p>
          <button
            className="primary"
            disabled={!types.length}
            onClick={() => startQuiz()}
          >
            Start {mode.toLowerCase()} session <ArrowRight size={17} />
          </button>
        </section>
      ) : submitted ? (
        <>
          <section className="panel result-panel">
            <span className="result-score">
              {Math.round((score / quiz.length) * 100)}
              <small>%</small>
            </span>
            <h2>
              {score === quiz.length
                ? "You’ve got this."
                : "Progress, one answer at a time."}
            </h2>
            <p>
              {score} of {quiz.length} correct. Your review schedule has been
              updated.
            </p>
            <div className="button-row">
              <button className="primary" onClick={() => startQuiz()}>
                Try a new session
              </button>
              {retries.length > 0 && (
                <button
                  className="secondary"
                  onClick={() => startQuiz(retries)}
                >
                  Retry {retries.length} missed
                </button>
              )}
            </div>
          </section>
          <h2 className="review-heading">Your answer review</h2>
          {quiz.map((q, i) => (
            <div
              className={`panel answer-review ${grade(answers[i] || "", q.answer) ? "correct" : "incorrect"}`}
              key={i}
            >
              <span>
                {grade(answers[i] || "", q.answer) ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <X size={20} />
                )}
              </span>
              <div>
                <h3>
                  <MathText text={q.prompt} />
                </h3>
                <p>Your answer: {answers[i] || "No answer"}</p>
                <button type="button" className="secondary tutor-review-button" onClick={() => { setTutorReview(i); setTutorRequest(n => n + 1); }}>Discuss this question with AI</button>
                {!grade(answers[i] || "", q.answer) && (
                  <strong>
                    Correct answer: <MathText text={q.answer} />
                  </strong>
                )}
              </div>
            </div>
          ))}
        </>
      ) : mode === "Learn" && q ? (
        <section className="panel question-panel">
          <div className="question-counter">
            QUESTION {index + 1} OF {quiz.length}
          </div>
          <h2>
            <MathText text={q.prompt} />
          </h2>
          <QuestionInput
            question={q}
            value={answers[index] || ""}
            disabled={feedback !== null}
            onChange={(v) => setAnswers((a) => ({ ...a, [index]: v }))}
          />
          {feedback !== null ? (
            <div
              className={`feedback ${feedback ? "correct" : "incorrect"}`}
              role="status"
            >
              <strong>
                {feedback ? "That’s right!" : "Keep this one in mind."}
              </strong>
              {!feedback && (
                <p>
                  Correct answer: <MathText text={q.answer} />
                </p>
              )}
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  if (index === quiz.length - 1) void submit();
                  else {
                    setIndex((i) => i + 1);
                    setFeedback(null);
                  }
                }}
              >
                {index === quiz.length - 1 ? "See results" : "Next question"}
                <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <button
              className="primary"
              disabled={!answers[index]?.trim()}
              onClick={() => {
                const correct = grade(answers[index] || "", q.answer);
                setFeedback(correct);
                if (
                  !correct &&
                  quiz.filter((item) => item.cardId === q.cardId).length < 2
                )
                  setQuiz([...quiz, { ...q, options: shuffle(q.options) }]);
              }}
            >
              Check answer
            </button>
          )}
        </section>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="test-summary">
            {quiz.length} questions <span>•</span> Take your time. You’ve got
            this.
          </div>
          {quiz.map((q, i) => (
            <section className="panel question-panel" key={i}>
              <div className="question-counter">QUESTION {i + 1}</div>
              <h2>
                <MathText text={q.prompt} />
              </h2>
              <QuestionInput
                question={q}
                value={answers[i] || ""}
                onChange={(v) => setAnswers((a) => ({ ...a, [i]: v }))}
              />
            </section>
          ))}
          <button className="primary" type="submit" disabled={busy}>
            Submit test <CheckCircle2 size={17} />
          </button>
          <p className="muted">Unanswered questions count as incorrect.</p>
        </form>
      )}
      {mode !== "Flashcards" && tutor}
      {mode === "Test" && quiz && !submitted && <p className="muted">AI Tutor is disabled during tests. Submit your test to discuss each question in answer review.</p>}
    </div>
  );
}
function QuestionInput({
  question: q,
  value,
  onChange,
  disabled = false,
}: {
  question: Question;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return q.type === "written" ? (
    <label>
      Your answer
      <input
        autoComplete="off"
        aria-label="Your answer"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type what you remember…"
      />
    </label>
  ) : (
    <div className="answer-options">
      {q.options.map((option, i) => (
        <button
          type="button"
          disabled={disabled}
          aria-pressed={value === option}
          className={value === option ? "selected" : ""}
          key={option}
          onClick={() => onChange(option)}
        >
          <span>{String.fromCharCode(65 + i)}</span>
          <MathText text={option} />
        </button>
      ))}
    </div>
  );
}
