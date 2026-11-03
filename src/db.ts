import Dexie, { type Table } from "dexie";
import {
  type StudySet,
  type Session,
  type ReviewEvent,
  validateBackup,
  review,
  uid,
} from "./domain";
import {
  emptyPlatform,
  type BankQuestion,
  type Attempt,
  type Draft,
  type PlanTask,
  type StudyNote,
  type Bookmark,
  type Preference,
  type LearningQuestion,
} from "./platform";
export class RecallDB extends Dexie {
  banks!: Table<BankQuestion, string>;
  attempts!: Table<Attempt, string>;
  drafts!: Table<Draft, string>;
  tasks!: Table<PlanTask, string>;
  notes!: Table<StudyNote, string>;
  bookmarks!: Table<Bookmark, string>;
  preferences!: Table<Preference, string>;
  syncState!: Table<{ id: string; value: string }, string>;
  sets!: Table<StudySet, string>;
  sessions!: Table<Session, string>;
  reviews!: Table<ReviewEvent, string>;
  constructor(name = "recall-local") {
    super(name);
    this.version(1).stores({
      sets: "id,title,folder,updated,lastStudied",
      sessions: "id,setId,date,mode",
    });
    this.version(2).stores({ reviews: "id,setId,cardId,date" });
    this.version(3).stores({
      banks: "id,bank,category,difficulty,updated",
      attempts: "id,date,mode",
      drafts: "id,mode",
      tasks: "id,date,done",
      notes: "id,topic,setId,updated",
      bookmarks: "id,kind,setId",
      preferences: "id",
      syncState: "id",
    });
  }
}
export const workspaceId =
  typeof localStorage !== "undefined"
    ? localStorage.getItem("recall-workspace") || "guest"
    : "guest";
export const db = new RecallDB(
  workspaceId === "guest" ? "recall-local" : `recall-account-${workspaceId}`,
);
export const platformTables = (database = db): Table[] => [
  database.banks,
  database.attempts,
  database.drafts,
  database.tasks,
  database.notes,
  database.bookmarks,
  database.preferences,
];
export async function exportBackup(database = db) {
  return database.transaction(
    "r",
    [
      database.sets,
      database.sessions,
      database.reviews,
      ...platformTables(database),
    ],
    async () => ({
      version: 2 as const,
      sets: await database.sets.toArray(),
      sessions: await database.sessions.toArray(),
      reviews: await database.reviews.toArray(),
      platform: {
        banks: await database.banks.toArray(),
        attempts: await database.attempts.toArray(),
        drafts: await database.drafts.toArray(),
        tasks: await database.tasks.toArray(),
        notes: await database.notes.toArray(),
        bookmarks: await database.bookmarks.toArray(),
        preferences: await database.preferences.toArray(),
      },
    }),
  );
}
export async function restoreBackup(value: unknown) {
  const data = validateBackup(value);
  const platform = data.platform || emptyPlatform();
  await db.transaction(
    "rw",
    [db.sets, db.sessions, db.reviews, ...platformTables()],
    async () => {
      await db.sets.clear();
      await db.sessions.clear();
      await db.reviews.clear();
      await db.sets.bulkPut(data.sets);
      await db.sessions.bulkPut(data.sessions);
      await db.reviews.bulkPut(data.reviews);
      for (const table of platformTables()) {
        await table.clear();
        await table.bulkPut(
          platform[table.name as keyof typeof platform] as never[],
        );
      }
    },
  );
}
export function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Apply every attempt in order, including difficult-card repeats, atomically.
export async function recordSession(
  setId: string,
  mode: string,
  attempts: { cardId: string; known: boolean }[],
) {
  await db.transaction("rw", db.sets, db.sessions, db.reviews, async () => {
    const current = await db.sets.get(setId);
    if (!current) throw new Error("This study set no longer exists.");
    const now = Date.now();
    const cards = new Map(current.cards.map((c) => [c.id, c]));
    const events: ReviewEvent[] = [];
    for (const attempt of attempts) {
      const card = cards.get(attempt.cardId);
      if (!card)
        throw new Error("A card changed during this session. Please restart.");
      const rated = review(card, attempt.known, now);
      cards.set(card.id, rated);
      events.push({
        id: uid(),
        setId,
        cardId: card.id,
        term: card.term,
        date: now,
        known: attempt.known,
        interval: rated.interval,
        mode,
      });
    }
    await db.sets.put({
      ...current,
      lastStudied: now,
      cards: [...cards.values()],
    });
    await db.reviews.bulkAdd(events);
    await db.sessions.add({
      id: uid(),
      setId,
      title: current.title,
      mode,
      date: now,
      total: attempts.length,
      correct: attempts.filter((a) => a.known).length,
    });
  });
}

// Copy guest records with fresh keys and remap every reference. Never remove guest data.
export async function importGuestWorkspace(source = new RecallDB()) {
  const backup = await exportBackup(source);
  const mapSet = new Map(backup.sets.map((s) => [s.id, uid()]));
  const mapCard = new Map(
    backup.sets.flatMap((s) => s.cards.map((c) => [`${s.id}:${c.id}`, uid()])),
  );
  const mapBank = new Map(backup.platform.banks.map((q) => [q.id, uid()]));
  const setKey = (id: string) => mapSet.get(id) || `guest:${id}`;
  const cardKey = (setId: string, cardId: string) =>
    mapCard.get(`${setId}:${cardId}`) || `guest:${cardId}`;
  const question = (q: LearningQuestion): LearningQuestion =>
    q.source === "bank"
      ? { ...q, id: mapBank.get(q.id) || `guest:${q.id}` }
      : {
          ...q,
          id: `${setKey(q.setId)}:${cardKey(q.setId, q.cardId)}`,
          setId: setKey(q.setId),
          cardId: cardKey(q.setId, q.cardId),
        };
  let skippedDrafts = 0;
  await db.transaction("rw", db.tables, async () => {
    await db.sets.bulkAdd(
      backup.sets.map((s) => ({
        ...s,
        id: setKey(s.id),
        cards: s.cards.map((c) => ({ ...c, id: cardKey(s.id, c.id) })),
      })),
    );
    await db.sessions.bulkAdd(
      backup.sessions.map((s) => ({ ...s, id: uid(), setId: setKey(s.setId) })),
    );
    await db.reviews.bulkAdd(
      backup.reviews.map((r) => ({
        ...r,
        id: uid(),
        setId: setKey(r.setId),
        cardId: cardKey(r.setId, r.cardId),
      })),
    );
    await db.banks.bulkAdd(
      backup.platform.banks.map((q) => ({ ...q, id: mapBank.get(q.id)! })),
    );
    await db.attempts.bulkAdd(
      backup.platform.attempts.map((a) => ({
        ...a,
        id: uid(),
        questions: a.questions.map(question),
      })),
    );
    await db.tasks.bulkAdd(
      backup.platform.tasks.map((t) => ({
        ...t,
        id: uid(),
        setId: t.setId ? setKey(t.setId) : "",
      })),
    );
    await db.notes.bulkAdd(
      backup.platform.notes.map((n) => ({
        ...n,
        id: uid(),
        setId: n.setId ? setKey(n.setId) : "",
      })),
    );
    await db.bookmarks.bulkAdd(
      backup.platform.bookmarks.map((b) => ({
        ...b,
        id: uid(),
        setId: b.setId ? setKey(b.setId) : "",
        sourceId:
          b.kind === "bank"
            ? mapBank.get(b.sourceId) || `guest:${b.sourceId}`
            : cardKey(b.setId, b.sourceId),
      })),
    );
    for (const d of backup.platform.drafts) {
      if (await db.drafts.get(d.id)) {
        skippedDrafts++;
        continue;
      }
      await db.drafts.add({ ...d, questions: d.questions.map(question) });
    }
    for (const p of backup.platform.preferences)
      if (!(await db.preferences.get(p.id))) await db.preferences.add(p);
  });
  source.close();
  return skippedDrafts;
}
