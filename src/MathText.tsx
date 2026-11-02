import katex from "katex";
import "katex/dist/katex.min.css";

// Parse only the two explicit LaTeX delimiters supported by Anki exports.
// Ordinary text stays in React's escaped text nodes, never innerHTML.
const DELIMITED_MATH = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;

export function MathText({ text }: { text: string }) {
  const pieces: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(DELIMITED_MATH)) {
    const start = match.index;
    if (start > cursor) {
      pieces.push(text.slice(cursor, start).replace(/<br\s*\/?>/gi, "\n"));
    }

    const displayMode = match[2] !== undefined;
    const source = (displayMode ? match[2] : match[1]) ?? "";
    let html: string;
    try {
      html = katex.renderToString(source, {
        displayMode,
        throwOnError: true,
        trust: false,
        strict: "ignore",
      });
    } catch {
      // Preserve incorrect or unsupported mathematics for editing.
      pieces.push(match[0]);
      cursor = start + match[0].length;
      continue;
    }

    pieces.push(
      <span
        key={start}
        className={displayMode ? "math-expression display" : "math-expression"}
        dangerouslySetInnerHTML={{ __html: html }}
      />,
    );
    cursor = start + match[0].length;
  }

  if (cursor < text.length) {
    pieces.push(text.slice(cursor).replace(/<br\s*\/?>/gi, "\n"));
  }

  return <span className="math-text">{pieces}</span>;
}
