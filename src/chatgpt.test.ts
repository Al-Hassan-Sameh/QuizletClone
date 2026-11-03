import { describe, expect, it } from "vitest";
import { chatGPTPrompt } from "./chatgpt";
import type { TutorContext } from "./tutor";
const card: TutorContext = {
  setId: "english", cardId: "card-12", title: "English vocabulary",
  term: "Wealthy district", prompt: "It is an ____ area.",
  options: ["affluent", "ancient", "accessible", "abundant"], subject: "English", topic: ["Vocabulary"],
  revealed: false, answer: "affluent", definition: "wealthy", selectedAnswer: "abundant",
  notes: "PRIVATE NOTE", related: [{ cardId: "secret", term: "Secret related card", definition: "Hidden answer" }],
};
describe("ChatGPT handoff", () => {
  it("preserves MCQ order and omits every answer-bearing field before reveal", () => {
    const prompt = chatGPTPrompt(card, "Explain", "Why is option 4 wrong?");
    expect(prompt).toContain("Hints only");
    expect(prompt).toContain('"number": 4');
    expect(prompt).toContain('"label": "D"');
    expect(prompt).not.toContain("PRIVATE NOTE");
    expect(prompt).not.toContain("Hidden answer");
    expect(prompt).not.toContain('"correctAnswer"');
    expect(prompt).not.toContain('"definition"');
    expect(prompt).toContain("Why is option 4 wrong?");
  });
  it("includes revealed source facts and labels imported content as data", () => {
    const prompt = chatGPTPrompt({ ...card, revealed: true }, "Mistake Analysis", "Explain my mistake");
    expect(prompt).toContain('"correctAnswer": "affluent"');
    expect(prompt).toContain('"selectedAnswer": "abundant"');
    expect(prompt).toContain("Teaching mode: Mistake Analysis");
    expect(prompt).toContain("untrusted data");
  });
  it("does not carry a previous card into a new prompt", () => {
    const prompt = chatGPTPrompt({ ...card, cardId: "next", prompt: "What is photosynthesis?", options: [] }, "Socratic", "");
    expect(prompt).toContain("photosynthesis");
    expect(prompt).not.toContain("affluent");
    expect(prompt).not.toContain("card-12");
  });
});
