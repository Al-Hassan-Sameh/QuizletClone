import Dexie, { type Table } from "dexie";
import {
  type StudySet,
  type Session,
  type ReviewEvent,
  validateBackup,
  review,
  uid,
} from "./domain";
class RecallDB extends Dexie {
  sets!: Table<StudySet, string>;
  sessions!: Table<Session, string>;
  reviews!: Table<ReviewEvent, string>;
  constructor() {
    super("recall-local");
    this.version(1).stores({
      sets: "id,title,folder,updated,lastStudied",
      sessions: "id,setId,date,mode",
    });
    this.version(2).stores({ reviews: "id,setId,cardId,date" });
  }
}
export const db = new RecallDB();
export async function exportBackup() {
  return db.transaction("r", db.sets, db.sessions, db.reviews, async () => ({
    version: 1 as const,
    sets: await db.sets.toArray(),
    sessions: await db.sessions.toArray(),
    reviews: await db.reviews.toArray(),
  }));
}
export async function restoreBackup(value: unknown) {
  const data = validateBackup(value);
  await db.transaction("rw", db.sets, db.sessions, db.reviews, async () => {
    await db.sets.clear();
    await db.sessions.clear();
    await db.reviews.clear();
    await db.sets.bulkPut(data.sets);
    await db.sessions.bulkPut(data.sessions);
    await db.reviews.bulkPut(data.reviews);
  });
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
