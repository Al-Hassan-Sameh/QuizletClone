export type Status = "new" | "learning" | "known";
export interface Card {
  id: string;
  term: string;
  definition: string;
  notes: string;
  status: Status;
  reviews: number;
  lastReviewed: number | null;
  due: number;
  interval: number;
  ease: number;
}
export interface StudySet {
  id: string;
  title: string;
  description: string;
  folder: string;
  tags: string[];
  favorite: boolean;
  created: number;
  updated: number;
  lastStudied: number;
  cards: Card[];
}
export interface Session {
  id: string;
  setId: string;
  title: string;
  mode: string;
  date: number;
  correct: number;
  total: number;
}
export interface ReviewEvent {
  id: string;
  setId: string;
  cardId: string;
  term: string;
  date: number;
  known: boolean;
  interval: number;
  mode: string;
}
export type QuestionType = "written" | "multiple" | "boolean";
export interface Question {
  cardId: string;
  prompt: string;
  answer: string;
  type: QuestionType;
  options: string[];
}
export const uid = () => crypto.randomUUID();
export const blankCard = (): Card => ({
  id: uid(),
  term: "",
  definition: "",
  notes: "",
  status: "new",
  reviews: 0,
  lastReviewed: null,
  due: 0,
  interval: 0,
  ease: 2.5,
});
export const blankSet = (): StudySet => ({
  id: uid(),
  title: "",
  description: "",
  folder: "",
  tags: [],
  favorite: false,
  created: Date.now(),
  updated: Date.now(),
  lastStudied: 0,
  cards: [blankCard(), blankCard()],
});
export const normalize = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
export const grade = (answer: string, expected: string) =>
  normalize(answer) === normalize(expected);
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
// Simplified SM-2: successful recalls use 1, 6, then interval × ease days;
// a failed recall resets the interval to 1 day and lowers ease (minimum 1.3).
export function review(card: Card, known: boolean, now = Date.now()): Card {
  const interval = known
    ? card.status !== "known"
      ? 1
      : card.interval === 1
        ? 6
        : Math.max(1, Math.round(card.interval * card.ease))
    : 1;
  return {
    ...card,
    status: known ? "known" : "learning",
    reviews: card.reviews + 1,
    lastReviewed: now,
    interval,
    ease: Math.max(1.3, card.ease + (known ? 0.1 : -0.2)),
    due: now + interval * 86400000,
  };
}
export function questions(
  cards: Card[],
  count: number,
  types: QuestionType[],
): Question[] {
  if (!types.length) throw new Error("Choose at least one question type.");
  return shuffle(cards)
    .slice(0, Math.max(1, count))
    .map((card, i) => {
      let type = types[i % types.length];
      const alternatives = [
        ...new Set(
          cards
            .filter((c) => !grade(c.definition, card.definition))
            .map((c) => c.definition),
        ),
      ];
      if (!alternatives.length) type = "written";
      if (type === "boolean") {
        const correct = Math.random() > 0.5;
        const shown = correct ? card.definition : shuffle(alternatives)[0];
        return {
          cardId: card.id,
          prompt: `${card.term}\n${shown}`,
          answer: correct ? "True" : "False",
          type,
          options: ["True", "False"],
        };
      }
      return {
        cardId: card.id,
        prompt: card.term,
        answer: card.definition,
        type,
        options:
          type === "multiple"
            ? shuffle([card.definition, ...shuffle(alternatives).slice(0, 3)])
            : [],
      };
    });
}
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("CSV contains an unclosed quote.");
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
export function importPairs(text: string, csv = false): Card[] {
  let rows = csv
    ? parseCSV(text)
    : text
        .split(/\r?\n/)
        .filter((s) => s.trim())
        .map((s) => s.split("\t"));
  if (
    csv &&
    normalize(rows[0]?.[0] || "") === "term" &&
    normalize(rows[0]?.[1] || "") === "definition"
  )
    rows = rows.slice(1);
  if (!rows.length || rows.some((r) => !r[0]?.trim() || !r[1]?.trim()))
    throw new Error("Each row needs a term and definition.");
  return rows.map((r) => ({
    ...blankCard(),
    term: r[0].trim(),
    definition: r[1].trim(),
    notes: r[2]?.trim() || "",
  }));
}
const finite = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
export function validateBackup(value: unknown): {
  version: 1;
  sets: StudySet[];
  sessions: Session[];
  reviews: ReviewEvent[];
} {
  const v = value as {
    version: number;
    sets: StudySet[];
    sessions: Session[];
    reviews?: ReviewEvent[];
  };
  if (
    !v ||
    v.version !== 1 ||
    !Array.isArray(v.sets) ||
    !Array.isArray(v.sessions)
  )
    throw new Error("Invalid Recall backup.");
  const ids = new Set<string>();
  for (const s of v.sets) {
    if (
      !s ||
      typeof s.id !== "string" ||
      ids.has(s.id) ||
      !s.title?.trim() ||
      typeof s.description !== "string" ||
      typeof s.folder !== "string" ||
      !Array.isArray(s.tags) ||
      s.tags.some((t) => typeof t !== "string") ||
      typeof s.favorite !== "boolean" ||
      ![s.created, s.updated, s.lastStudied].every(finite) ||
      !Array.isArray(s.cards) ||
      !s.cards.length
    )
      throw new Error("Invalid study set in backup.");
    ids.add(s.id);
    const cardIds = new Set<string>();
    for (const c of s.cards) {
      if (
        !c ||
        typeof c.id !== "string" ||
        cardIds.has(c.id) ||
        typeof c.term !== "string" ||
        !c.term.trim() ||
        typeof c.definition !== "string" ||
        !c.definition.trim() ||
        typeof c.notes !== "string" ||
        !["new", "known", "learning"].includes(c.status) ||
        ![c.reviews, c.due, c.interval, c.ease].every(finite) ||
        c.ease < 1.3 ||
        (c.lastReviewed !== null && !finite(c.lastReviewed))
      )
        throw new Error("Invalid flashcard in backup.");
      cardIds.add(c.id);
    }
  }
  const sessions = new Set<string>();
  for (const s of v.sessions) {
    if (
      !s ||
      typeof s.id !== "string" ||
      sessions.has(s.id) ||
      typeof s.setId !== "string" ||
      typeof s.title !== "string" ||
      typeof s.mode !== "string" ||
      ![s.date, s.correct, s.total].every(finite) ||
      s.correct > s.total
    )
      throw new Error("Invalid study session.");
    sessions.add(s.id);
  }
  const reviews = v.reviews ?? [];
  if (!Array.isArray(reviews)) throw new Error("Invalid review history.");
  const reviewIds = new Set<string>();
  for (const r of reviews) {
    if (
      !r ||
      typeof r.id !== "string" ||
      reviewIds.has(r.id) ||
      typeof r.setId !== "string" ||
      typeof r.cardId !== "string" ||
      typeof r.term !== "string" ||
      typeof r.mode !== "string" ||
      typeof r.known !== "boolean" ||
      !finite(r.date) ||
      !finite(r.interval)
    )
      throw new Error("Invalid review event.");
    reviewIds.add(r.id);
  }
  return { ...v, version: 1, reviews };
}
export function streak(sessions: Session[], now = new Date()): number {
  const days = new Set(
    sessions.map((s) => new Date(s.date).toLocaleDateString("en-CA")),
  );
  const d = new Date(now);
  let count = 0;
  if (!days.has(d.toLocaleDateString("en-CA"))) d.setDate(d.getDate() - 1);
  while (days.has(d.toLocaleDateString("en-CA"))) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}
