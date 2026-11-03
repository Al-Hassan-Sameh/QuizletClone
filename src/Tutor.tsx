import { ChatGPTHandoff } from "./ChatGPTHandoff";
import { useEffect, useRef, useState } from "react";
import { MathText } from "./MathText";
import { contextFor, conversationKey, readTutorStream, tutorModes, type TutorContext, type TutorMessage, type TutorMode } from "./tutor";
import type { Card, Question, StudySet } from "./domain";
import "./tutor.css";

let credential = "";
let identity = "guest";
const setting = (key: string, fallback: string) => { try { return localStorage.getItem("recall-tutor:" + key) ?? fallback; } catch { return fallback; } };
identity = setting("identity", "guest");
function saveSetting(key: string, value: string) { try { localStorage.setItem("recall-tutor:" + key, value); } catch { /* Study remains available with storage blocked. */ } }
const actions = [
  ["Explain this", "Explain the current concept."],
  ["Give me a hint", "Give me a small hint without revealing or identifying the answer."],
  ["Why is this correct?", "Why is the correct answer correct?"],
  ["Explain the wrong answers", "Explain each incorrect option, using its number and text."],
  ["Give examples", "Give a different practical example of this concept."],
  ["Simplify this", "Explain this using beginner-friendly language."],
  ["Test my understanding", "Ask one follow-up question and wait for my answer."],
];
function RichText({ text }: { text: string }) {
  return <>{text.split(/(\x60\x60\x60[\s\S]*?(?:\x60\x60\x60|$)|\\\[[\s\S]*?\\\])/g).map((part, i) => part.startsWith("\x60\x60\x60") ?
    <pre key={i}><code>{part.replace(/^\x60\x60\x60[^\n]*\n?/, "").replace(/\x60\x60\x60$/, "")}</code></pre> :
    part.startsWith("\\[") ? <MathText key={i} text={part} /> :
    <div key={i} className="tutor-prose">{part.split("\n").map((line, j) => {
      const content = line.replace(/^#{1,6}\s/, "").replace(/^[-*]\s/, "• ");
      const pieces = content.split(/(\*\*[^*]+\*\*|\x60[^\x60]+\x60)/g).map((p, k) => p.startsWith("**") ?
        <strong key={k}><MathText text={p.slice(2, -2)} /></strong> : p.startsWith("\x60") ?
        <code key={k}>{p.slice(1, -1)}</code> : <MathText key={k} text={p} />);
      return /^#/.test(line) ? <h4 key={j}>{pieces}</h4> : <div key={j}>{pieces.length ? pieces : <br />}</div>;
    })}</div>)}</>;
}
export function Tutor({ set, card, question, revealed, selectedAnswer = "", onReveal, requestOpen = 0 }: {
  set: StudySet; card: Card; question?: Question; revealed: boolean; selectedAnswer?: string; onReveal?: () => void; requestOpen?: number;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"chatgpt" | "api">("chatgpt");
  const [mobile, setMobile] = useState(window.innerWidth <= 650);
  useEffect(() => { const resize = () => setMobile(window.innerWidth <= 650); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }, []);
  useEffect(() => { if (requestOpen) setOpen(true); }, [requestOpen]);
  const [notes, setNotes] = useState(false);
  const [related, setRelated] = useState(false);
  const [user, setUser] = useState(identity);
  const context = contextFor(set, card, question, revealed, selectedAnswer, notes, related);
  const key = conversationKey(context) + (revealed ? ":revealed" : ":hints");
  return <div className={"tutor-layout " + (open ? "tutor-is-open" : "")}>
    <button type="button" className="secondary tutor-launch" aria-expanded={open} onClick={() => setOpen(v => !v)}>✦ {open ? "Close AI Tutor" : "Ask AI Tutor"}</button>
    {open && <aside className="tutor-panel" aria-label="AI study tutor" role={mobile ? "dialog" : undefined} aria-modal={mobile || undefined} onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
      if (mobile && event.key === "Tab") {
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary')).filter(el => el.getClientRects().length);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header><div><strong>✦ Your study tutor</strong><small>Discussing: Card {set.cards.findIndex(c => c.id === card.id) + 1} — {card.term.slice(0, 90)}</small></div><button type="button" className="secondary" aria-label="Close tutor" onClick={() => setOpen(false)}>×</button></header>
      <div className="tutor-methods" role="group" aria-label="Tutor connection">
        <button type="button" className="secondary" aria-pressed={method === "chatgpt"} onClick={() => setMethod("chatgpt")}>ChatGPT — existing plan</button>
        <button type="button" className="secondary" aria-pressed={method === "api"} onClick={() => setMethod("api")}>Embedded AI — separate API billing</button>
      </div>
      {method === "chatgpt" ? <ChatGPTHandoff key={key} context={context} notes={notes} onNotes={setNotes} /> :
      <TutorChat key={key + user} context={context} storageKey={key} user={user} onUser={setUser} notes={notes} onNotes={setNotes} related={related} onRelated={setRelated} onReveal={onReveal} />}
    </aside>}
  </div>;
}
function TutorChat({ context, storageKey, user, onUser, notes, onNotes, related, onRelated, onReveal }: {
  context: TutorContext; storageKey: string; user: string; onUser: (user: string) => void;
  notes: boolean; onNotes: (value: boolean) => void; related: boolean; onRelated: (value: boolean) => void; onReveal?: () => void;
}) {
  const historyId = "recall-tutor:history:" + JSON.stringify([user, storageKey]);
  const [historyEnabled, setHistoryEnabled] = useState(setting("history", "true") === "true");
  const [messages, setMessages] = useState<TutorMessage[]>(() => {
    try {
      const data: unknown = setting("history", "true") === "true" ? JSON.parse(localStorage.getItem(historyId) || "[]") : [];
      return Array.isArray(data) ? data.filter((m): m is TutorMessage => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-40) : [];
    } catch { return []; }
  });
  const [mode, setMode] = useState<TutorMode>("Socratic");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<TutorMessage[] | null>(null);
  const [endpoint, setEndpoint] = useState(setting("endpoint", ""));
  const [token, setToken] = useState("");
  const [sync, setSync] = useState(false);
  const [connected, setConnected] = useState(!!credential);
  const [copied, setCopied] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const api = (path: string, init?: RequestInit) => {
    const url = new URL(endpoint || location.origin);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Use HTTPS for the tutor service.");
    url.pathname = "/api/tutor" + path; url.search = ""; url.hash = "";
    return fetch(url, { ...init, headers: { "Content-Type": "application/json", Authorization: "Bearer " + credential, ...init?.headers }, cache: "no-store" });
  };
  useEffect(() => {
    const changed = () => setOnline(navigator.onLine);
    window.addEventListener("online", changed); window.addEventListener("offline", changed);
    inputRef.current?.focus({ preventScroll: true });
    return () => { controller.current?.abort(); window.removeEventListener("online", changed); window.removeEventListener("offline", changed); };
  }, []);
  useEffect(() => {
    try {
      if (historyEnabled) localStorage.setItem(historyId, JSON.stringify(messages.slice(-40)));
      else localStorage.removeItem(historyId);
    } catch { setError("Chat history could not be saved. Browser storage may be full."); }
  }, [messages, historyEnabled, historyId]);
  useEffect(() => { if (atBottom.current) scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); }, [messages, busy]);
  async function connect() {
    setError("");
    credential = token.trim();
    try {
      const response = await api("/session", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not connect.");
      saveSetting("endpoint", endpoint);
      identity = new URL(endpoint || location.origin).origin + " / " + data.user; saveSetting("identity", identity); setConnected(true); onUser(identity); setToken("");
    } catch (e) { credential = ""; setConnected(false); setError(e instanceof Error ? e.message : "Connection failed."); }
  }
  async function send(text: string, previous?: TutorMessage[]) {
    if (busy || !online || (!previous && !text.trim())) return;
    if (!credential) { setError("Connect to your tutor service below first."); return; }
    const turns: TutorMessage[] = previous || [...messages, { role: "user", content: text.trim() }];
    const abort = new AbortController(); controller.current = abort;
    setMessages([...turns, { role: "assistant", content: "" }]); setBusy(true); setError(""); setRetry(turns); setInput(""); atBottom.current = true;
    try {
      // Upload only this explicit context to this user's private namespace.
      const registered = await api("/cards", { method: "PUT", body: JSON.stringify({ context }), signal: abort.signal });
      const record = await registered.json();
      if (!registered.ok) throw new Error(record.error || "Unable to share this card.");
      const response = await api("/chat", { method: "POST", signal: abort.signal, body: JSON.stringify({
        cardRef: record.cardRef, mode, messages: turns.slice(-19), saveHistory: historyEnabled && sync,
      }) });
      let answer = "";
      await readTutorStream(response, delta => {
        if (abort.signal.aborted) return;
        answer += delta;
        setMessages([...turns, { role: "assistant", content: answer }]);
      });
      setRetry(null);
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Tutor request failed."); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  async function clear() {
    if (busy) return;
    try {
      if (credential) {
        const response = await api("/history", { method: "DELETE", body: JSON.stringify({ key: storageKey }) });
        if (!response.ok) throw new Error("Could not delete cloud history. Retry when connected.");
      }
      setMessages([]); setRetry(null); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not clear history."); }
  }
  async function loadCloud() {
    try {
      const response = await api("/history?key=" + encodeURIComponent(storageKey));
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessages(result.messages); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load history."); }
  }
  return <>
    <div className="tutor-controls">
      <label>Teaching style<select value={mode} onChange={e => setMode(e.target.value as TutorMode)}>{tutorModes.map(m => <option key={m}>{m}</option>)}</select></label>
      <details><summary>Privacy & connection</summary>
        <p>Sending shares this card, its options, and this conversation with your configured AI service. Definitions are shared after reveal. Notes and related cards are opt-in.</p>
        <label className="check-label"><input type="checkbox" checked={notes} onChange={e => onNotes(e.target.checked)} />Include this card's private notes after reveal</label>
        <label className="check-label"><input type="checkbox" checked={related} onChange={e => onRelated(e.target.checked)} />Find up to 3 related cards in this set after reveal</label>
        <label className="check-label"><input type="checkbox" checked={historyEnabled} onChange={e => { setHistoryEnabled(e.target.checked); saveSetting("history", String(e.target.checked)); }} />Save this conversation on this device</label>
        <p>Turning this off deletes this local thread. Use Clear conversation to delete its cloud copy too. Other saved card threads remain until deleted.</p>
        <label className="check-label"><input type="checkbox" disabled={!historyEnabled || !connected} checked={sync} onChange={e => setSync(e.target.checked)} />Also save this thread to my tutor account</label>
        {user !== "guest" && !connected && <p>Saved local conversations for {user} remain available offline. Reconnect to ask new questions.</p>}
        <label>Tutor service URL<input type="url" placeholder="https://tutor.example.com" value={endpoint} disabled={connected} onChange={e => setEndpoint(e.target.value)} /></label>
        {!connected ? <><label>Personal tutor access token<input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} /></label><button type="button" className="secondary" disabled={!online || !token.trim()} onClick={() => void connect()}>Connect securely</button></> :
          <><p>Connected as {user}. Access token stays in memory.</p><button type="button" className="secondary" onClick={() => { controller.current?.abort(); credential = ""; setConnected(false); setBusy(false); }}>Disconnect</button><button type="button" className="secondary" disabled={!online || busy} onClick={() => void loadCloud()}>Load saved cloud conversation</button></>}
      </details>
      {!context.revealed && <p className="tutor-notice">Hints only until you submit or reveal. Prior answer discussions are kept separately.
        {onReveal && <button type="button" className="text-button" onClick={onReveal}>Reveal answer</button>}</p>}
      {!online && <p className="tutor-notice" role="status">You're offline. Saved conversations remain readable. New AI responses require internet.</p>}
    </div>
    <div className="tutor-messages" ref={scroll} role="log" aria-label="Tutor conversation" onScroll={() => { const el = scroll.current; if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70; }}>
      {!messages.length && <div className="tutor-welcome"><h3>Let's understand it together.</h3><p>I receive the current question automatically. Ask about an option, request a hint, or choose a teaching style.</p></div>}
      {messages.map((m, i) => <article key={i} className={"tutor-bubble " + m.role}><small>{m.role === "user" ? "You" : "AI Tutor"}</small><RichText text={m.content} />{m.role === "assistant" && m.content && <button type="button" className="text-button" onClick={() => void navigator.clipboard.writeText(m.content).then(() => setCopied(i)).catch(() => setError("Copy failed. Select the text to copy it."))}>{copied === i ? "Copied" : "Copy"}</button>}</article>)}
      {busy && <p role="status" className="tutor-typing">Tutor is thinking<span>…</span></p>}
    </div>
    <div className="tutor-compose">
      {error && <div role="alert" className="tutor-error">{error}{retry && <button type="button" className="secondary" disabled={busy || !online} onClick={() => void send("", retry)}>Retry response</button>}</div>}
      <div className="tutor-actions">{actions.filter((_, i) => context.revealed || [1, 6].includes(i)).map(([label, prompt]) => <button type="button" className="secondary" key={label} disabled={busy || !online} onClick={() => void send(prompt)}>{label}</button>)}</div>
      <form onSubmit={e => { e.preventDefault(); void send(input); }}>
        <textarea ref={inputRef} aria-label="Ask about this card" placeholder="Ask about this card…" value={input} maxLength={4000} disabled={busy} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(input); } }} />
        <button className="primary" type="submit" disabled={busy || !online || !input.trim()}>Send</button>
      </form>
      {messages.length > 0 && !busy && !retry && <button type="button" className="text-button" disabled={!online} onClick={() => void send("Give me another example, then ask me a question.")}>Another example + a question</button>}
      <button type="button" className="text-button" disabled={busy} onClick={() => void clear()}>Clear conversation</button>
      <small>AI can make mistakes. Check against your study material. Card facts and extra explanations should be labeled.</small>
    </div>
  </>;
}
