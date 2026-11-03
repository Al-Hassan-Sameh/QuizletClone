import type { Card, Question, StudySet } from "./domain";

export const tutorModes = ["Explain", "Socratic", "Example", "Simplify", "Deep Dive", "Quiz Me", "Compare", "Mistake Analysis"] as const;
export type TutorMode = typeof tutorModes[number];
export interface TutorMessage { role: "user" | "assistant"; content: string }
export interface TutorContext {
  setId: string; cardId: string; title: string; term: string; prompt: string;
  answer?: string; options: string[]; definition?: string; notes?: string;
  subject: string; topic: string[]; selectedAnswer?: string;
  revealed: boolean; related: { cardId: string; term: string; definition: string }[];
}
export function contextFor(set: StudySet, card: Card, question: Question | undefined, revealed: boolean, selectedAnswer: string, notes: boolean, related: boolean): TutorContext {
  // Before reveal, withhold answer-bearing fields entirely, not just by prompt.
  const words = new Set(card.term.toLowerCase().match(/\w{3,}/g) || []);
  const nearby = related && revealed ? set.cards.filter(c => c.id !== card.id)
    .map(c => ({ c, score: (c.term.toLowerCase().match(/\w{3,}/g) || []).filter(w => words.has(w)).length }))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3)
    .map(({ c }) => ({ cardId: c.id, term: c.term.slice(0, 2000), definition: c.definition.slice(0, 4000) })) : [];
  return {
    setId: set.id, cardId: card.id, title: set.title, term: card.term,
    prompt: question?.prompt ?? card.term, options: question?.options ?? [],
    subject: set.folder, topic: set.tags, revealed,
    ...(revealed ? { answer: question?.answer ?? card.definition, definition: card.definition,
      selectedAnswer, ...(notes ? { notes: card.notes } : {}) } : {}),
    related: nearby,
  };
}
export function conversationKey(context: TutorContext) {
  // A card can have different generated questions; never mix those contexts.
  return JSON.stringify([context.setId, context.cardId, context.prompt, context.options]);
}
export async function readTutorStream(response: Response, onText: (text: string) => void) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Tutor unavailable. Please retry.");
  }
  if (!response.body) throw new Error("Streaming is unavailable in this browser.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "", complete = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.error) throw new Error(event.error);
        if (typeof event.delta === "string") onText(event.delta);
        if (event.done) complete = true;
      }
      if (done) break;
    }
    if (!complete) throw new Error("The connection ended early. Retry this response.");
  } finally { reader.releaseLock(); }
}
