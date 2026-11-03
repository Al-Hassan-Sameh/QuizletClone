import { describe, expect, it } from "vitest";
import { blankCard, blankSet } from "./domain";
import { contextFor, conversationKey, readTutorStream } from "./tutor";
const card = { ...blankCard(), id: "affluent", term: "A wealthy district is an ____ area.", definition: "affluent", notes: "Private note" };
const set = { ...blankSet(), id: "vocab", cards: [card, { ...blankCard(), id: "ancient", term: "Ancient", definition: "Very old" }] };
const question = { cardId: card.id, prompt: card.term, answer: "affluent", type: "multiple" as const, options: ["affluent", "ancient", "accessible", "abundant"] };
describe("card-aware tutor context", () => {
  it("shares exact MCQ option order but withholds answer-bearing fields before reveal", () => {
    const c = contextFor(set, card, question, false, "abundant", true, true);
    expect(c.options).toEqual(question.options);
    expect(c).not.toHaveProperty("answer");
    expect(c).not.toHaveProperty("definition");
    expect(c).not.toHaveProperty("notes");
    expect(c.related).toEqual([]);
  });
  it("includes submitted mistakes and only explicitly consented private notes", () => {
    const c = contextFor(set, card, question, true, "abundant", false, false);
    expect(c.answer).toBe("affluent"); expect(c.selectedAnswer).toBe("abundant");
    expect(c).not.toHaveProperty("notes");
    expect(contextFor(set, card, question, true, "", true, false).notes).toBe("Private note");
  });
  it("switches context and isolates variants even for the same card", () => {
    const a = contextFor(set, card, question, true, "", false, false);
    const b = contextFor(set, set.cards[1], undefined, true, "", false, false);
    expect(b.cardId).toBe("ancient"); expect(b.answer).toBe("Very old");
    expect(conversationKey(a)).not.toBe(conversationKey(b));
    expect(conversationKey(a)).not.toBe(conversationKey({ ...a, options: [...a.options].reverse() }));
  });
  it("streams split UTF-8 safely and requires a completion event", async () => {
    const bytes = new TextEncoder().encode('{"delta":"café"}\n{"done":true}\n');
    const response = new Response(new ReadableStream({ start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    }}));
    let output = ""; await readTutorStream(response, s => output += s);
    expect(output).toBe("café");
    await expect(readTutorStream(new Response('{"delta":"partial"}\n'), () => {})).rejects.toThrow("ended early");
  });
  it("turns provider failures into useful messages", async () => {
    await expect(readTutorStream(new Response('{"error":"Provider not configured"}', { status: 503 }), () => {})).rejects.toThrow("Provider not configured");
  });
});
