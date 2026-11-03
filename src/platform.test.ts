import "fake-indexeddb/auto";
import { describe, it, expect, afterEach } from "vitest";
import Dexie from "dexie";
import {
  blankSet,
  blankCard,
  normalize,
  questions,
  uid,
  validateBackup,
} from "./domain";
import {
  db,
  RecallDB,
  exportBackup,
  restoreBackup,
  importGuestWorkspace,
} from "./db";
import { canonical, decideSync, initialSync } from "./cloud";
import {
  emptyPlatform,
  validateBank,
  importBank,
  correctAnswer,
  fromBank,
  cardQuestions,
  weakFirst,
  mistakeIds,
  validatePlatform,
  type Attempt,
} from "./platform";
const bank = () =>
  validateBank({
    id: uid(),
    bank: "Vocabulary",
    prompt: "A wealthy area is ____.",
    options: ["affluent", "ancient", "accessible", "abundant"],
    correct: 0,
    explanation: "Affluent means wealthy.",
    hint: "Starts with A",
    difficulty: "easy",
    category: "Adjectives",
    updated: 1,
  });
afterEach(async () => {
  for (const table of db.tables) await table.clear();
});
describe("question integrity and grading", () => {
  it("rejects duplicate normalized choices, invalid keys, sizes and missing fields", () => {
    const q = bank();
    expect(() => validateBank({ ...q, options: [" YES ", "yes"] })).toThrow();
    expect(() => validateBank({ ...q, correct: 4 })).toThrow();
    expect(() => validateBank({ ...q, options: ["one"] })).toThrow();
    expect(() => validateBank({ ...q, hint: 42 })).toThrow();
    expect(() => importBank("{}")).toThrow();
  });
  it("imports independently and grades every randomized choice against the authored correct answer", () => {
    const q = bank();
    const imported = importBank(JSON.stringify([q, q]));
    expect(imported[0].id).not.toBe(imported[1].id);
    for (let i = 0; i < 20; i++) {
      const item = fromBank(q);
      expect(item.options.filter((o) => correctAnswer(item, o))).toEqual([
        "affluent",
      ]);
    }
  });
  it("deduplicates generated distractors after normalization and supports fewer valid choices", () => {
    const cards = ["Alpha", "Beta", " beta ", "BETA", "Gamma"].map(
      (definition, i) => ({ ...blankCard(), term: `Term ${i}`, definition }),
    );
    for (const q of questions(cards, 5, ["multiple"], 6)) {
      expect(new Set(q.options.map(normalize)).size).toBe(q.options.length);
      expect(q.options).toHaveLength(3);
      expect(
        q.options.filter((o) => normalize(o) === normalize(q.answer)),
      ).toHaveLength(1);
    }
    expect(questions([cards[0]], 1, ["multiple"])[0].type).toBe("written");
  });
  it("accepts authored alternatives only for written responses and honors exact checking", () => {
    const q = fromBank(bank());
    expect(correctAnswer(q, "AFFLUENT ")).toBe(true);
    q.alternatives = ["wealthy"];
    expect(correctAnswer(q, "wealthy")).toBe(false);
    q.options = [];
    expect(correctAnswer(q, " Wealthy ")).toBe(true);
    q.checking = "exact";
    expect(correctAnswer(q, " Wealthy ")).toBe(false);
    expect(correctAnswer(q, "wealthy")).toBe(true);
    expect(correctAnswer(q, "")).toBe(false);
  });
  it("uses latest outcomes for mistakes and prioritizes repeatedly missed material", () => {
    const q = fromBank(bank()),
      q2 = { ...fromBank(bank()), id: "second" };
    const a: Attempt = {
      id: uid(),
      mode: "Practice",
      date: 1,
      duration: 10,
      questions: [q, q2],
      answers: { 0: "wrong", 1: q2.answer },
      correct: 1,
    };
    expect(mistakeIds([a]).has(q.id)).toBe(true);
    expect(weakFirst([q, q2], [a], [])[0].id).toBe(q.id);
    expect(
      mistakeIds([
        a,
        {
          ...a,
          id: uid(),
          date: 2,
          questions: [q],
          answers: { 0: q.answer },
          correct: 1,
        },
      ]).size,
    ).toBe(0);
  });
});
describe("backward-compatible persistence", () => {
  it("migrates an actual v2 database without losing sets or reviews", async () => {
    const name = "migration-" + uid();
    const old = new Dexie(name);
    old.version(1).stores({
      sets: "id,title,folder,updated,lastStudied",
      sessions: "id,setId,date,mode",
    });
    old.version(2).stores({ reviews: "id,setId,cardId,date" });
    const s = {
      ...blankSet(),
      title: "Preserved",
      cards: [{ ...blankCard(), term: "Q", definition: "A" }],
    };
    await old.table("sets").put(s);
    old.close();
    const upgraded = new RecallDB(name);
    expect(await upgraded.sets.get(s.id)).toEqual(s);
    expect(await upgraded.banks.count()).toBe(0);
    await upgraded.delete();
  });
  it("round trips new tables and preserves existing cards, schedules and question IDs", async () => {
    const s = {
      ...blankSet(),
      title: "Set",
      cards: [
        { ...blankCard(), term: "Q", definition: "A", interval: 6, reviews: 2 },
      ],
    };
    await db.sets.put(s);
    const q = bank();
    await db.banks.put(q);
    await db.tasks.put({
      id: "task",
      title: "Exam",
      date: "2026-11-03",
      kind: "exam",
      setId: s.id,
      done: false,
    });
    await db.notes.put({
      id: "note",
      title: "Notes",
      body: "Keep",
      topic: "Topic",
      setId: s.id,
      updated: 1,
    });
    const backup = await exportBackup();
    await db.sets.clear();
    await db.banks.clear();
    await restoreBackup(backup);
    expect(await db.sets.get(s.id)).toEqual(s);
    expect(await db.banks.get(q.id)).toEqual(q);
    expect(await db.tasks.count()).toBe(1);
    expect(await db.notes.count()).toBe(1);
  });
  it("rejects corrupt backup atomically and accepts legacy version 1", async () => {
    const s = {
      ...blankSet(),
      title: "Keep",
      cards: [{ ...blankCard(), term: "Q", definition: "A" }],
    };
    await db.sets.put(s);
    const bad = await exportBackup();
    bad.platform.tasks.push({
      id: "bad",
      title: "Bad",
      date: "not-a-date",
      kind: "study",
      setId: "",
      done: false,
    });
    await expect(restoreBackup(bad)).rejects.toThrow();
    expect(await db.sets.get(s.id)).toEqual(s);
    expect(() =>
      validateBackup({ version: 1, sets: [{ ...s, title: 5 }], sessions: [] }),
    ).toThrow("Invalid study set");
    await restoreBackup({ version: 1, sets: [s], sessions: [] });
    expect(await db.sets.count()).toBe(1);
    expect(await db.banks.count()).toBe(0);
  });
  it("validates attempts and prevents fabricated scores from imports", () => {
    const q = fromBank(bank());
    const p = emptyPlatform();
    p.attempts = [
      {
        id: "a",
        mode: "Exam",
        date: 1,
        duration: 10,
        questions: [q],
        answers: { 0: "wrong" },
        correct: 1,
      },
    ];
    expect(() => validatePlatform(p)).toThrow();
    p.attempts[0].correct = 0;
    expect(validatePlatform(p)).toEqual(p);
  });
  it("converts cards with correct metadata and stable source IDs", () => {
    const s = {
      ...blankSet(),
      title: "Topic",
      cards: [
        {
          ...blankCard(),
          term: "Q",
          definition: "A",
          alternatives: ["Alternative"],
          difficulty: "hard" as const,
        },
      ],
    };
    const q = cardQuestions([s], "written")[0];
    expect(q.id).toBe(`${s.id}:${s.cards[0].id}`);
    expect(q.difficulty).toBe("hard");
    expect(correctAnswer(q, "alternative")).toBe(true);
  });
});
describe("sync conflict policy", () => {
  const payload = () => ({
    version: 2 as const,
    sets: [],
    sessions: [],
    reviews: [],
    platform: emptyPlatform(),
  });
  it("detects independent changes rather than overwriting newer remote data", () => {
    const base = payload();
    const state = { ...initialSync(), revision: 1, baseline: canonical(base) };
    const changed = {
      ...base,
      platform: {
        ...base.platform,
        notes: [
          {
            id: "n",
            title: "Note",
            body: "Offline",
            topic: "",
            setId: "",
            updated: 1,
          },
        ],
      },
    };
    expect(
      decideSync(canonical(changed), state, { revision: 2, payload: base }),
    ).toBe("conflict");
    expect(
      decideSync(canonical(base), state, { revision: 2, payload: changed }),
    ).toBe("pull");
    expect(
      decideSync(canonical(changed), state, { revision: 1, payload: base }),
    ).toBe("push");
    expect(
      decideSync(canonical(base), state, { revision: 1, payload: base }),
    ).toBe("clean");
  });
  it("treats identical payloads as synchronized regardless of key order", () => {
    expect(canonical({ b: 1, a: 2 })).toBe(canonical({ a: 2, b: 1 }));
    const p = payload();
    expect(
      decideSync(canonical(p), initialSync(), { revision: 5, payload: p }),
    ).toBe("clean");
  });
});

it("imports guest data without changing guest records and remaps history and links", async () => {
  const source = new RecallDB("guest-import-" + uid());
  const s = {
    ...blankSet(),
    title: "Guest set",
    cards: [{ ...blankCard(), term: "Q", definition: "A" }],
  };
  await source.sets.put(s);
  await source.sessions.put({
    id: "old-session",
    setId: s.id,
    title: s.title,
    mode: "Test",
    date: 1,
    correct: 1,
    total: 1,
  });
  await source.bookmarks.put({
    id: "old-bookmark",
    kind: "card",
    sourceId: s.cards[0].id,
    setId: s.id,
    title: "Q",
  });
  await source.notes.put({
    id: "note",
    title: "Linked",
    body: "Keep me",
    topic: "",
    setId: s.id,
    updated: 1,
  });
  const name = source.name;
  await importGuestWorkspace(source);
  const copies = await db.sets.toArray();
  expect(copies).toHaveLength(1);
  expect(copies[0].id).not.toBe(s.id);
  expect(copies[0].cards[0].id).not.toBe(s.cards[0].id);
  expect((await db.sessions.toArray())[0].setId).toBe(copies[0].id);
  expect((await db.bookmarks.toArray())[0].sourceId).toBe(
    copies[0].cards[0].id,
  );
  expect((await db.notes.toArray())[0].setId).toBe(copies[0].id);
  const original = new RecallDB(name);
  expect(await original.sets.get(s.id)).toEqual(s);
  await original.delete();
});
