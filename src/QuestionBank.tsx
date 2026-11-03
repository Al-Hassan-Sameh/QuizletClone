import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, download } from "./db";
import { uid } from "./domain";
import { importBank, validateBank, type BankQuestion } from "./platform";
import { MathText } from "./MathText";
const blank = (): BankQuestion => ({
  id: uid(),
  bank: "My question bank",
  prompt: "",
  options: ["", "", "", ""],
  correct: 0,
  explanation: "",
  hint: "",
  difficulty: "medium",
  category: "",
  updated: Date.now(),
});
export function QuestionBank() {
  const banks = useLiveQuery(() => db.banks.toArray()) || [];
  const [draft, setDraft] = useState<BankQuestion | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [removed, setRemoved] = useState<BankQuestion | null>(null);
  async function run(action: () => Promise<unknown>, message: string) {
    try {
      await action();
      setStatus(message);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="platform-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CRAFT BETTER QUESTIONS</div>
          <h1>Question banks</h1>
          <p>Independent questions, built for deliberate practice.</p>
        </div>
        <button className="primary" onClick={() => setDraft(blank())}>
          Create question
        </button>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {draft ? (
        <form
          className="panel bank-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const q = validateBank(draft);
              await db.banks.put(q);
              setDraft(null);
            }, "Question saved");
          }}
        >
          <h2>
            {banks.some((q) => q.id === draft.id)
              ? "Edit question"
              : "New question"}
          </h2>
          <div className="two-col">
            <label>
              Bank name
              <input
                required
                value={draft.bank}
                onChange={(e) => setDraft({ ...draft, bank: e.target.value })}
              />
            </label>
            <label>
              Category
              <input
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
              />
            </label>
          </div>
          <label>
            Question
            <textarea
              aria-label="Question"
              required
              maxLength={20000}
              value={draft.prompt}
              onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
              placeholder="The district has wealthy residents. It is an ____ area."
            />
          </label>
          <fieldset>
            <legend>Answer choices · select the correct answer</legend>
            {draft.options.map((o, i) => (
              <div className="choice-editor" key={i}>
                <label className="check-label">
                  <input
                    type="radio"
                    name="correct"
                    aria-label={`Correct choice ${i + 1}`}
                    checked={draft.correct === i}
                    onChange={() => setDraft({ ...draft, correct: i })}
                  />
                  {i + 1}
                </label>
                <input
                  aria-label={`Choice ${i + 1}`}
                  required
                  maxLength={10000}
                  value={o}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      options: draft.options.map((v, j) =>
                        j === i ? e.target.value : v,
                      ),
                    })
                  }
                />
                {draft.options.length > 2 && (
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Remove choice ${i + 1}`}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        options: draft.options.filter((_, j) => j !== i),
                        correct:
                          draft.correct === i
                            ? 0
                            : draft.correct > i
                              ? draft.correct - 1
                              : draft.correct,
                      })
                    }
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {draft.options.length < 6 && (
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setDraft({ ...draft, options: [...draft.options, ""] })
                }
              >
                Add choice
              </button>
            )}
          </fieldset>
          <div className="two-col">
            <label>
              Hint
              <input
                value={draft.hint}
                onChange={(e) => setDraft({ ...draft, hint: e.target.value })}
              />
            </label>
            <label>
              Difficulty
              <select
                value={draft.difficulty}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    difficulty: e.target.value as BankQuestion["difficulty"],
                  })
                }
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
          </div>
          <label>
            Explanation
            <textarea
              aria-label="Explanation"
              value={draft.explanation}
              onChange={(e) =>
                setDraft({ ...draft, explanation: e.target.value })
              }
            />
          </label>
          <div className="button-row">
            <button className="primary">Save question</button>
            <button
              className="secondary"
              type="button"
              onClick={() => setDraft(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="filters">
            <label className="search">
              <input
                aria-label="Search questions"
                placeholder="Search questions, banks, categories…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              className="secondary"
              onClick={() => download("recall-questions.json", banks)}
            >
              Export questions
            </button>
            <label className="secondary file-button">
              Import questions
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void run(async () => {
                      if (file.size > 5_000_000)
                        throw new Error("Import limit: 5 MB.");
                      await db.banks.bulkAdd(importBank(await file.text()));
                    }, "Questions imported");
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <details className="panel">
            <summary>Bulk import format</summary>
            <p>
              Import a JSON array. Choices must be unique; correct is the
              zero-based choice index.
            </p>
            <pre>
              {JSON.stringify(
                [
                  {
                    bank: "Vocabulary",
                    prompt: "A wealthy area is ____.",
                    options: ["affluent", "ancient"],
                    correct: 0,
                    explanation: "Affluent means wealthy.",
                    hint: "Starts with A",
                    difficulty: "easy",
                    category: "Adjectives",
                  },
                ],
                null,
                2,
              )}
            </pre>
          </details>
          <div className="bank-list">
            {banks
              .filter((q) =>
                `${q.prompt} ${q.bank} ${q.category}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((q) => (
                <article className="panel" key={q.id}>
                  <span className="pill">
                    {q.bank} · {q.difficulty}
                  </span>
                  <h2>
                    <MathText text={q.prompt} />
                  </h2>
                  <p>
                    {q.options.length} choices · {q.category || "Uncategorized"}
                  </p>
                  <div className="button-row">
                    <button
                      className="secondary"
                      onClick={() => setDraft(structuredClone(q))}
                    >
                      Edit question
                    </button>
                    <button
                      className="secondary"
                      onClick={() =>
                        void run(
                          () =>
                            db.banks.add({
                              ...q,
                              id: uid(),
                              updated: Date.now(),
                            }),
                          "Question duplicated",
                        )
                      }
                    >
                      Duplicate question
                    </button>
                    <button
                      className="secondary"
                      onClick={() =>
                        void run(
                          () =>
                            db.bookmarks.put({
                              id: `bank:${q.id}`,
                              kind: "bank",
                              sourceId: q.id,
                              setId: "",
                              title: q.prompt,
                            }),
                          "Question bookmarked",
                        )
                      }
                    >
                      Save question
                    </button>
                    <button
                      className="danger-text"
                      onClick={() =>
                        void run(async () => {
                          await db.banks.delete(q.id);
                          setRemoved(q);
                        }, "Question deleted. Undo is available below.")
                      }
                    >
                      Delete question
                    </button>
                  </div>
                </article>
              ))}
          </div>
          {!banks.length && (
            <section className="empty">
              <h2>A question worth asking.</h2>
              <p>
                Create your first question or import an existing bank. No AI
                required.
              </p>
            </section>
          )}
        </>
      )}
      {removed && (
        <button
          className="secondary"
          onClick={() =>
            void run(async () => {
              await db.banks.put(removed);
              setRemoved(null);
            }, "Question restored")
          }
        >
          Undo question deletion
        </button>
      )}
    </div>
  );
}
