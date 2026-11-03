import {
  grade,
  normalize,
  questions,
  shuffle,
  uid,
  type StudySet,
} from "./domain";
export type Difficulty = "easy" | "medium" | "hard";
export interface BankQuestion {
  id: string;
  bank: string;
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
  hint: string;
  difficulty: Difficulty;
  category: string;
  updated: number;
}
export interface LearningQuestion {
  id: string;
  source: "card" | "bank";
  setId: string;
  cardId: string;
  prompt: string;
  answer: string;
  options: string[];
  explanation: string;
  hint: string;
  difficulty: Difficulty;
  category: string;
  alternatives: string[];
  checking: "exact" | "normalized";
}
export interface Attempt {
  id: string;
  mode: string;
  date: number;
  duration: number;
  questions: LearningQuestion[];
  answers: Record<number, string>;
  correct: number;
}
export interface Draft {
  id: string;
  mode: string;
  started: number;
  deadline: number | null;
  questions: LearningQuestion[];
  answers: Record<number, string>;
  flags: number[];
  index: number;
  explanations: boolean;
  immediate: boolean;
}
export interface PlanTask {
  id: string;
  title: string;
  date: string;
  kind: "review" | "exam" | "study";
  setId: string;
  done: boolean;
}
export interface StudyNote {
  id: string;
  title: string;
  body: string;
  topic: string;
  setId: string;
  updated: number;
}
export interface Bookmark {
  id: string;
  kind: "card" | "bank";
  sourceId: string;
  setId: string;
  title: string;
}
export interface Preference {
  id: string;
  value: string;
}
export interface PlatformData {
  banks: BankQuestion[];
  attempts: Attempt[];
  drafts: Draft[];
  tasks: PlanTask[];
  notes: StudyNote[];
  bookmarks: Bookmark[];
  preferences: Preference[];
}
export const emptyPlatform = (): PlatformData => ({
  banks: [],
  attempts: [],
  drafts: [],
  tasks: [],
  notes: [],
  bookmarks: [],
  preferences: [],
});
export function validateBank(value: unknown): BankQuestion {
  const q = value as BankQuestion;
  if (
    !q ||
    typeof q.prompt !== "string" ||
    !q.prompt.trim() ||
    q.prompt.length > 20000 ||
    !Array.isArray(q.options) ||
    q.options.length < 2 ||
    q.options.length > 6 ||
    q.options.some(
      (o) => typeof o !== "string" || !o.trim() || o.length > 10000,
    ) ||
    new Set(q.options.map(normalize)).size !== q.options.length ||
    !Number.isInteger(q.correct) ||
    q.correct < 0 ||
    q.correct >= q.options.length ||
    !["easy", "medium", "hard"].includes(q.difficulty) ||
    ["bank", "explanation", "hint", "category"].some(
      (k) => typeof q[k as keyof BankQuestion] !== "string",
    )
  )
    throw new Error(
      "Each question needs a prompt, 2–6 unique choices, one correct choice, and a difficulty.",
    );
  return {
    ...q,
    id: typeof q.id === "string" && q.id ? q.id : uid(),
    prompt: q.prompt.trim(),
    options: q.options.map((o) => o.trim()),
    updated: Date.now(),
  };
}
export function importBank(text: string): BankQuestion[] {
  if (text.length > 5_000_000)
    throw new Error("Question imports are limited to 5 MB.");
  const data = JSON.parse(text);
  if (!Array.isArray(data) || !data.length || data.length > 5000)
    throw new Error("Import a JSON array of 1–5000 questions.");
  return data.map((q) => ({ ...validateBank(q), id: uid() }));
}
export function fromBank(q: BankQuestion): LearningQuestion {
  return {
    id: q.id,
    source: "bank",
    setId: "",
    cardId: "",
    prompt: q.prompt,
    answer: q.options[q.correct],
    options: shuffle(q.options),
    explanation: q.explanation,
    hint: q.hint,
    difficulty: q.difficulty,
    category: q.category || q.bank,
    alternatives: [],
    checking: "normalized",
  };
}
export function cardQuestions(
  sets: StudySet[],
  type:
    "multiple" | "written" | "boolean" | ("multiple" | "written" | "boolean")[],
  optionCount = 4,
): LearningQuestion[] {
  return sets.flatMap((s) =>
    questions(
      s.cards,
      s.cards.length,
      Array.isArray(type) ? type : [type],
      optionCount,
    ).map((q) => {
      const c = s.cards.find((c) => c.id === q.cardId)!;
      return {
        id: `${s.id}:${c.id}`,
        source: "card" as const,
        setId: s.id,
        cardId: c.id,
        prompt: q.prompt,
        answer: q.answer,
        options: q.options,
        explanation: c.notes,
        hint: "",
        difficulty: c.difficulty || "medium",
        category: s.tags[0] || s.folder || s.title,
        alternatives: c.alternatives || [],
        checking: c.checking || "normalized",
      };
    }),
  );
}
export function correctAnswer(q: LearningQuestion, value: string): boolean {
  if (!value.trim()) return false;
  return [q.answer, ...(!q.options.length ? q.alternatives : [])].some((a) =>
    q.checking === "exact" ? value === a : grade(value, a),
  );
}
export function weakFirst(
  pool: LearningQuestion[],
  attempts: Attempt[],
  sets: StudySet[],
): LearningQuestion[] {
  const history = new Map<string, { hits: number; total: number }>();
  for (const a of attempts)
    a.questions.forEach((q, i) => {
      const h = history.get(q.id) || { hits: 0, total: 0 };
      h.total++;
      h.hits += Number(correctAnswer(q, a.answers[i] || ""));
      history.set(q.id, h);
    });
  const cards = new Map<string, StudySet["cards"][number]>(
    sets.flatMap((s) => s.cards.map((c) => [`${s.id}:${c.id}`, c] as const)),
  );
  const score = (q: LearningQuestion) => {
    const h = history.get(q.id);
    const c = cards.get(q.id);
    return (
      (h ? ((h.total - h.hits) / h.total) * 10 : 5) +
      (c && c.due <= Date.now() ? 2 : 0) +
      (c?.status === "learning" ? 3 : 0)
    );
  };
  return shuffle(pool).sort((a, b) => score(b) - score(a));
}
export function mistakeIds(attempts: Attempt[]): Set<string> {
  const latest = new Map<string, boolean>();
  [...attempts]
    .sort((a, b) => a.date - b.date)
    .forEach((a) =>
      a.questions.forEach((q, i) =>
        latest.set(q.id, correctAnswer(q, a.answers[i] || "")),
      ),
    );
  return new Set([...latest].filter(([, ok]) => !ok).map(([id]) => id));
}
// Calendar days, rather than UTC day boundaries, match the user's planner and streaks.
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function validatePlatform(value: unknown): PlatformData {
  const p = value as PlatformData;
  if (
    !p ||
    Object.keys(emptyPlatform()).some(
      (k) => !Array.isArray(p[k as keyof PlatformData]),
    )
  )
    throw new Error("Invalid platform backup.");
  const string = (v: unknown) => typeof v === "string";
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0;
  const unique = (rows: { id: string }[]) =>
    rows.every((r) => r && string(r.id) && r.id.length > 0) &&
    new Set(rows.map((r) => r.id)).size === rows.length;
  if (
    Object.values(p).some(
      (rows) => !Array.isArray(rows) || rows.length > 100000 || !unique(rows),
    )
  )
    throw new Error("Invalid or duplicate platform records.");
  p.banks.forEach(validateBank);
  const validQ = (q: LearningQuestion) =>
    q &&
    string(q.id) &&
    ["card", "bank"].includes(q.source) &&
    [
      "setId",
      "cardId",
      "prompt",
      "answer",
      "explanation",
      "hint",
      "category",
    ].every((k) => string(q[k as keyof LearningQuestion])) &&
    Array.isArray(q.options) &&
    q.options.every(string) &&
    Array.isArray(q.alternatives) &&
    q.alternatives.every(string) &&
    ["easy", "medium", "hard"].includes(q.difficulty) &&
    ["exact", "normalized"].includes(q.checking);
  const validAnswers = (a: Record<number, string>, size: number) =>
    a &&
    typeof a === "object" &&
    !Array.isArray(a) &&
    Object.entries(a).every(
      ([k, v]) => /^\d+$/.test(k) && Number(k) < size && string(v),
    );
  if (
    p.attempts.some(
      (a) =>
        !string(a.mode) ||
        !num(a.date) ||
        !num(a.duration) ||
        !Array.isArray(a.questions) ||
        !a.questions.length ||
        !a.questions.every(validQ) ||
        !validAnswers(a.answers, a.questions.length) ||
        a.correct !==
          a.questions.filter((q, i) => correctAnswer(q, a.answers[i] || ""))
            .length,
    ) ||
    p.drafts.some(
      (d) =>
        !string(d.mode) ||
        !num(d.started) ||
        !(d.deadline === null || num(d.deadline)) ||
        !Array.isArray(d.questions) ||
        !d.questions.length ||
        !d.questions.every(validQ) ||
        !validAnswers(d.answers, d.questions.length) ||
        !Number.isInteger(d.index) ||
        d.index < 0 ||
        d.index >= d.questions.length ||
        !Array.isArray(d.flags) ||
        d.flags.some(
          (i) => !Number.isInteger(i) || i < 0 || i >= d.questions.length,
        ) ||
        typeof d.explanations !== "boolean" ||
        typeof d.immediate !== "boolean",
    ) ||
    p.tasks.some(
      (t) =>
        !string(t.title) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(t.date) ||
        !["review", "exam", "study"].includes(t.kind) ||
        !string(t.setId) ||
        typeof t.done !== "boolean",
    ) ||
    p.notes.some(
      (n) =>
        !["title", "body", "topic", "setId"].every((k) =>
          string(n[k as keyof StudyNote]),
        ) || !num(n.updated),
    ) ||
    p.bookmarks.some(
      (b) =>
        !["card", "bank"].includes(b.kind) ||
        !["sourceId", "setId", "title"].every((k) =>
          string(b[k as keyof Bookmark]),
        ),
    ) ||
    p.preferences.some((p) => !string(p.value))
  )
    throw new Error("Invalid platform record.");
  return p;
}
