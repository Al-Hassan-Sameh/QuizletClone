import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import katex from "katex";
import { importPairs, parseCSV, validateBackup } from "./domain";

const readDeck = (name: string) =>
  readFileSync(new URL("../decks/" + name, import.meta.url), "utf8");
const json = JSON.parse(
  readDeck("Quantum_Mechanics_100_Rigorous_Recall_Set.json"),
);
const set = validateBackup(json).sets[0];

describe("rigorous quantum mechanics deck", () => {
  it("has 100 HOW questions in the exact difficulty progression", () => {
    expect(set.cards).toHaveLength(100);
    const levels = set.cards.map((card) => {
      expect(card.term.startsWith("How")).toBe(true);
      expect(card.status).toBe("new");
      return card.notes.split(" · ")[1];
    });
    expect(levels.slice(0, 20)).toEqual(Array(20).fill("Beginner"));
    expect(levels.slice(20, 70)).toEqual(Array(50).fill("Intermediate"));
    expect(levels.slice(70)).toEqual(Array(30).fill("Advanced"));
    expect(new Set(set.cards.map((c) => c.id)).size).toBe(100);
  });

  it("renders every LaTeX expression without a syntax error", () => {
    let count = 0;
    for (const card of set.cards) {
      const expressions = [...card.definition.matchAll(/\\\(([\s\S]*?)\\\)/g)];
      expect(expressions.length).toBeGreaterThan(0);
      for (const expression of expressions) {
        expect(() =>
          katex.renderToString(expression[1], {
            throwOnError: true,
            trust: false,
          }),
        ).not.toThrow();
        count++;
      }
    }
    expect(count).toBeGreaterThan(500);
  });

  it("round-trips the app CSV with all questions and answers intact", () => {
    const cards = importPairs(
      readDeck("Quantum_Mechanics_100_Rigorous_Recall.csv"),
      true,
    );
    expect(cards).toHaveLength(100);
    for (let i = 0; i < cards.length; i++) {
      expect(cards[i].term).toBe(set.cards[i].term);
      expect(cards[i].definition).toBe(set.cards[i].definition);
      expect(cards[i].notes).toBe(set.cards[i].notes);
    }
  });

  it("retains the five-column Anki export with sequential IDs", () => {
    const rows = parseCSV(readDeck("Quantum_Mechanics_100_Rigorous_Anki.csv"));
    expect(rows).toHaveLength(101);
    expect(rows[0]).toEqual(["ID", "Question", "Answer", "Difficulty", "Tags"]);
    for (let i = 1; i <= 100; i++) {
      expect(rows[i][0]).toBe(String(i).padStart(3, "0"));
      expect(rows[i][1]).toBe(set.cards[i - 1].term);
      expect(rows[i][2]).toBe(set.cards[i - 1].definition);
    }
  });
});
