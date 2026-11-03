import { useState } from "react";
import { Check, Upload, Trash2, Plus, ArrowRight } from "lucide-react";
import { type StudySet, type Card, blankCard, importPairs } from "./domain";
import { Modal } from "./components";
export function Editor({
  initial,
  onSave,
  onCancel,
}: {
  initial: StudySet;
  onSave: (s: StudySet) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [bulk, setBulk] = useState("");
  const [error, setError] = useState("");
  const [remove, setRemove] = useState<string | null>(null);
  const updateCard = (
    id: string,
    field: keyof Pick<Card, "term" | "definition" | "notes">,
    value: string,
  ) =>
    setDraft({
      ...draft,
      cards: draft.cards.map((c) =>
        c.id === id ? { ...c, [field]: value } : c,
      ),
    });
  const addPairs = (text: string, csv = false) => {
    try {
      const cards = importPairs(text, csv);
      setDraft({
        ...draft,
        cards: [
          ...draft.cards.filter((c) => c.term.trim() || c.definition.trim()),
          ...cards,
        ],
      });
      setBulk("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const cards = draft.cards.filter(
          (c) => c.term.trim() || c.definition.trim(),
        );
        if (
          !draft.title.trim() ||
          !cards.length ||
          cards.some((c) => !c.term.trim() || !c.definition.trim())
        ) {
          setError(
            "Add a title and at least one complete term-definition pair.",
          );
          return;
        }
        onSave({
          ...draft,
          title: draft.title.trim(),
          updated: Date.now(),
          cards: cards.map((c) => ({
            ...c,
            term: c.term.trim(),
            definition: c.definition.trim(),
          })),
        });
      }}
    >
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE SOMETHING MEMORABLE</div>
          <h1>{initial.title ? "Edit study set" : "Create a study set"}</h1>
          <p>Gather your ideas. Give them a place to stick.</p>
        </div>
        <div className="button-row">
          <button className="secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary" type="submit">
            <Check size={17} />
            Save set
          </button>
        </div>
      </div>
      <section className="panel editor-meta">
        <label>
          Title
          <input
            placeholder="e.g. The essentials of biology"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            required
            maxLength={200}
          />
        </label>
        <label>
          Description
          <textarea
            placeholder="What are you learning?"
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        </label>
        <div className="two-col">
          <label>
            Folder
            <input
              placeholder="e.g. Spring semester"
              value={draft.folder}
              onChange={(e) => setDraft({ ...draft, folder: e.target.value })}
            />
          </label>
          <label>
            Tags · comma separated
            <input
              placeholder="biology, science"
              value={draft.tags.join(",")}
              onChange={(e) =>
                setDraft({ ...draft, tags: e.target.value.split(",") })
              }
              onBlur={() =>
                setDraft({
                  ...draft,
                  tags: [
                    ...new Set(draft.tags.map((t) => t.trim()).filter(Boolean)),
                  ],
                })
              }
            />
          </label>
        </div>
      </section>
      <div className="section-heading">
        <h2>
          Flashcards <span>{draft.cards.length}</span>
        </h2>
        <label className="secondary file-button">
          <Upload size={16} />
          Import CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) addPairs(await f.text(), true);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <div className="editor-cards">
        {draft.cards.map((c, i) => (
          <section className="panel edit-card" key={c.id}>
            <div className="edit-card-head">
              <span>{String(i + 1).padStart(2, "0")}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Delete card ${i + 1}`}
                onClick={() => setRemove(c.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="two-col">
              <label>
                Term
                <input
                  aria-label={`Term ${i + 1}`}
                  value={c.term}
                  onChange={(e) => updateCard(c.id, "term", e.target.value)}
                  placeholder="Enter a term or question"
                />
              </label>
              <label>
                Definition
                <textarea
                  aria-label={`Definition ${i + 1}`}
                  value={c.definition}
                  onChange={(e) =>
                    updateCard(c.id, "definition", e.target.value)
                  }
                  placeholder="Enter the definition or answer"
                />
              </label>
            </div>
            <div className="two-col card-advanced">
              <label>
                Difficulty
                <select
                  aria-label={`Difficulty ${i + 1}`}
                  value={c.difficulty || "medium"}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      cards: draft.cards.map((item) =>
                        item.id === c.id
                          ? {
                              ...item,
                              difficulty: e.target.value as Card["difficulty"],
                            }
                          : item,
                      ),
                    })
                  }
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label>
                Answer checking
                <select
                  aria-label={`Answer checking ${i + 1}`}
                  value={c.checking || "normalized"}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      cards: draft.cards.map((item) =>
                        item.id === c.id
                          ? {
                              ...item,
                              checking: e.target.value as Card["checking"],
                            }
                          : item,
                      ),
                    })
                  }
                >
                  <option value="normalized">
                    Ignore case and extra whitespace
                  </option>
                  <option value="exact">Exact text</option>
                </select>
              </label>
            </div>
            <label>
              Accepted written alternatives · one per line
              <textarea
                aria-label={`Alternatives ${i + 1}`}
                value={(c.alternatives || []).join("\n")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    cards: draft.cards.map((item) =>
                      item.id === c.id
                        ? { ...item, alternatives: e.target.value.split("\n") }
                        : item,
                    ),
                  })
                }
              />
            </label>
            <label className="notes-label">
              Notes · optional
              <input
                aria-label={`Notes ${i + 1}`}
                value={c.notes}
                onChange={(e) => updateCard(c.id, "notes", e.target.value)}
                placeholder="A helpful hint, example, or memory"
              />
            </label>
          </section>
        ))}
      </div>
      <button
        type="button"
        className="add-card"
        onClick={() =>
          setDraft({ ...draft, cards: [...draft.cards, blankCard()] })
        }
      >
        <Plus size={18} />
        Add a flashcard
      </button>
      <section className="panel bulk-panel">
        <h2>Already have your notes?</h2>
        <p>
          Paste one term and definition per line, separated by a Tab. CSV
          accepts term, definition, and optional notes columns.
        </p>
        <textarea
          aria-label="Bulk flashcards"
          placeholder={"Term\tDefinition\nAnother term\tAnother definition"}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
        />
        <button
          className="secondary"
          type="button"
          onClick={() => addPairs(bulk)}
        >
          <Plus size={17} />
          Add pasted cards
        </button>
      </section>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="save-bottom">
        <button className="primary" type="submit">
          Save study set <ArrowRight size={17} />
        </button>
      </div>
      {remove && (
        <Modal title="Remove this flashcard?" onClose={() => setRemove(null)}>
          <p>This card will be removed when you save the set.</p>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setRemove(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                setDraft({
                  ...draft,
                  cards: draft.cards.filter((c) => c.id !== remove),
                });
                setRemove(null);
              }}
            >
              Remove card
            </button>
          </div>
        </Modal>
      )}
    </form>
  );
}
