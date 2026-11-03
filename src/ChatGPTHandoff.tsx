import { useRef, useState } from "react";
import { chatGPTPrompt } from "./chatgpt";
import type { TutorContext, TutorMode } from "./tutor";

export function ChatGPTHandoff({ context, notes, onNotes }: {
  context: TutorContext; notes: boolean; onNotes: (value: boolean) => void;
}) {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<TutorMode>("Socratic");
  const [status, setStatus] = useState("");
  const preview = useRef<HTMLTextAreaElement>(null);
  const prompt = chatGPTPrompt(context, mode, question);
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setStatus("Copied. Open ChatGPT, paste the prompt, and send it.");
    } catch {
      setStatus("Clipboard unavailable. Select and copy the preview below manually.");
      preview.current?.focus(); preview.current?.select();
    }
  }
  return <section className="chatgpt-handoff" aria-label="Ask in ChatGPT">
    <h3>Use ChatGPT with your existing plan</h3>
    <p>No API key or paid backend required. This copies a study prompt; your conversation takes place in ChatGPT. Your plan's normal usage limits apply.</p>
    <label>Teaching style for ChatGPT<select value={mode} onChange={e => { setMode(e.target.value as TutorMode); setStatus(""); }}>
      {["Explain", "Socratic", "Example", "Simplify", "Deep Dive", "Quiz Me", "Compare", "Mistake Analysis"].map(m => <option key={m}>{m}</option>)}
    </select></label>
    {!context.revealed && <p className="tutor-notice">Hints only. Answers, private notes, and related-card answers are excluded until you reveal or submit in the study interface. ChatGPT may still infer an answer.</p>}
    <label>Your question for ChatGPT<textarea autoFocus value={question} maxLength={4000} onChange={e => { setQuestion(e.target.value); setStatus(""); }} placeholder={context.revealed ? "Why is option 4 wrong?" : "Give me a hint without the answer"} /></label>
    <label className="check-label"><input type="checkbox" checked={notes} disabled={!context.revealed} onChange={e => { onNotes(e.target.checked); setStatus(""); }} />Include this card's private notes</label>
    <div className="button-row">
      <button type="button" className="primary" onClick={() => void copy()}>1. Copy study prompt</button>
      <a className="secondary" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">2. Open ChatGPT ↗</a>
    </div>
    <p>3. Paste the prompt into ChatGPT and send it. For another card, copy its new prompt. Replies and history stay in ChatGPT and do not sync back here.</p>
    {status && <p role="status">{status}</p>}
    <label>Study prompt preview<textarea ref={preview} readOnly value={prompt} rows={9} onFocus={e => e.currentTarget.select()} /></label>
    <small>The preview shows exactly what you copy. Nothing is sent automatically, and study content is never put in the ChatGPT link.</small>
  </section>;
}
