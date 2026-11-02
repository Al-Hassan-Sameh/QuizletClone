import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  blankCard,
  blankSet,
  grade,
  review,
  questions,
  importPairs,
  validateBackup,
  streak,
  shuffle,
} from "./domain";
import { db, exportBackup, restoreBackup } from "./db";
beforeEach(async () => {
  await db.sets.clear();
  await db.sessions.clear();
  await db.reviews.clear();
});
describe("learning logic", () => {
  it("normalizes only case and whitespace", () => {
    expect(grade("  CELL   WALL ", "cell wall")).toBe(true);
    expect(grade("cell wall", "cell membrane")).toBe(false);
    expect(grade("two", "2")).toBe(false);
  });
  it("uses deterministic SM-2 intervals and persists performance", () => {
    const card = blankCard();
    const first = review(card, true, 1000);
    expect(first.interval).toBe(1);
    expect(first.due).toBe(86401000);
    expect(first.reviews).toBe(1);
    const second = review(first, true, 2000);
    expect(second.interval).toBe(6);
    expect(review(second, true, 3000).interval).toBe(16);
    const failed = review(second, false, 4000);
    expect(failed.status).toBe("learning");
    expect(failed.interval).toBe(1);
    expect(review(failed, true, 5000).interval).toBe(1);
    let low = failed;
    for (let i = 0; i < 20; i++) low = review(low, false);
    expect(low.ease).toBe(1.3);
  });
  it("generates bounded distinct choices with the correct answer", () => {
    const cards = ["one", "two", "three", "four", "five"].map((s, i) => ({
      ...blankCard(),
      term: String(i),
      definition: s,
    }));
    for (let i = 0; i < 10; i++) {
      const qs = questions(cards, 20, ["multiple"]);
      expect(qs).toHaveLength(5);
      for (const q of qs) {
        expect(q.options).toContain(q.answer);
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
      }
    }
  });
  it("falls back to written questions when no distractor exists", () => {
    const card = { ...blankCard(), term: "A", definition: "B" };
    expect(questions([card], 10, ["multiple"])[0].type).toBe("written");
    expect(questions([card], 10, ["boolean"])[0].type).toBe("written");
    expect(() => questions([card], 1, [])).toThrow();
  });
  it("generates valid true/false questions", () => {
    const cards = ["a", "b"].map((s) => ({
      ...blankCard(),
      term: s,
      definition: s.toUpperCase(),
    }));
    for (const q of questions(cards, 2, ["boolean"])) {
      expect(q.options).toEqual(["True", "False"]);
      const [term, def] = q.prompt.split("\n");
      expect(q.answer).toBe(term.toUpperCase() === def ? "True" : "False");
    }
  });
  it("shuffles without mutating input or losing cards", () => {
    const a = [1, 2, 3];
    expect(shuffle(a).sort()).toEqual(a);
    expect(a).toEqual([1, 2, 3]);
  });
  it("calculates streak from actual local activity", () => {
    const date = new Date(2026, 5, 12, 12);
    const sessions = [0, 1, 2].map((i) => ({
      id: String(i),
      setId: "x",
      title: "x",
      mode: "Test",
      date: new Date(2026, 5, 12 - i, 12).getTime(),
      correct: 1,
      total: 1,
    }));
    expect(streak(sessions, date)).toBe(3);
    expect(streak([], date)).toBe(0);
  });
});
describe("imports and storage", () => {
  it("parses TSV and quoted CSV including commas and embedded newlines", () => {
    expect(importPairs("a\tb\nc\td")).toHaveLength(2);
    const cards = importPairs(
      'term,definition,notes\r\n"A, B","line 1\nline 2","say ""hi"""',
      true,
    );
    expect(cards[0].term).toBe("A, B");
    expect(cards[0].definition).toBe("line 1\nline 2");
    expect(cards[0].notes).toBe('say "hi"');
    expect(() => importPairs("a,", true)).toThrow();
    expect(() => importPairs('"a,b', true)).toThrow();
  });
  it("creates, updates, reloads, and deletes sets and cards", async () => {
    const s = blankSet();
    s.title = "Biology";
    s.cards = [{ ...blankCard(), term: "Cell", definition: "Unit of life" }];
    await db.sets.add(s);
    await db.sets.update(s.id, {
      title: "Biology 101",
      cards: [
        ...s.cards,
        { ...blankCard(), term: "DNA", definition: "Genetic material" },
      ],
    });
    db.close();
    await db.open();
    const saved = await db.sets.get(s.id);
    expect(saved?.title).toBe("Biology 101");
    expect(saved?.cards).toHaveLength(2);
    await db.sets.delete(s.id);
    expect(await db.sets.count()).toBe(0);
  });
  it("round trips complete backups and schedules", async () => {
    const s = blankSet();
    s.title = "Test";
    s.cards = [
      { ...review(blankCard(), true, 100), term: "Q", definition: "A" },
    ];
    await db.sets.add(s);
    await db.sessions.add({
      id: "session",
      setId: s.id,
      title: s.title,
      mode: "Test",
      date: 100,
      correct: 1,
      total: 1,
    });
    const data = await exportBackup();
    await db.sets.clear();
    await db.sessions.clear();
    await db.reviews.clear();
    await restoreBackup(JSON.parse(JSON.stringify(data)));
    expect(await exportBackup()).toEqual(data);
  });
  it("rejects invalid backups before replacing data", async () => {
    const s = blankSet();
    s.title = "Keep me";
    await db.sets.add(s);
    await expect(
      restoreBackup({ version: 2, sets: [], sessions: [] }),
    ).rejects.toThrow();
    expect(await db.sets.count()).toBe(1);
    expect(() =>
      validateBackup({ version: 1, sets: [{ id: "x" }], sessions: [] }),
    ).toThrow();
  });
});

it("preserves v1 sets when migrating to the review-history schema", async () => {
  const { default: Dexie } = await import("dexie");
  db.close();
  await db.delete();
  const previous = new Dexie("recall-local");
  previous.version(1).stores({
    sets: "id,title,folder,updated,lastStudied",
    sessions: "id,setId,date,mode",
  });
  const set = blankSet();
  set.title = "Before migration";
  await previous.table("sets").add(set);
  previous.close();
  await db.open();
  expect((await db.sets.get(set.id))?.title).toBe("Before migration");
  expect(await db.reviews.count()).toBe(0);
});
it("backs up review events and reads older backups without events", async () => {
  const event = {
    id: "review",
    setId: "set",
    cardId: "card",
    term: "Cell",
    date: 100,
    known: true,
    interval: 1,
    mode: "Flashcards",
  };
  await db.reviews.add(event);
  const backup = await exportBackup();
  await db.reviews.clear();
  await restoreBackup(backup);
  expect(await db.reviews.get(event.id)).toEqual(event);
  await restoreBackup({ version: 1, sets: [], sessions: [] });
  expect(await db.reviews.count()).toBe(0);
});

it("records every adaptive attempt and resets failed-card intervals before recovery", async () => {
  const { recordSession } = await import("./db");
  const set = blankSet();
  set.title = "Adaptive";
  const card = {
    ...review(review(blankCard(), true, 100), true, 200),
    term: "Q",
    definition: "A",
  };
  set.cards = [card];
  await db.sets.add(set);
  await recordSession(set.id, "Learn", [
    { cardId: card.id, known: false },
    { cardId: card.id, known: true },
  ]);
  const saved = await db.sets.get(set.id);
  expect(saved?.cards[0].reviews).toBe(4);
  expect(saved?.cards[0].interval).toBe(1);
  expect(await db.reviews.count()).toBe(2);
  expect((await db.sessions.toArray())[0].correct).toBe(1);
});
