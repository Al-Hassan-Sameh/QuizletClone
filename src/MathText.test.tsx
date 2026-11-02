import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MathText } from "./MathText";

describe("MathText", () => {
  it("renders inline and display LaTeX rather than exposing delimiters", () => {
    const html = renderToStaticMarkup(
      <MathText
        text={
          "Amplitude \\(\\langle x|\\psi\\rangle\\) and \\[E=\\hbar\\omega\\]"
        }
      />,
    );
    expect(html).toContain('class="katex"');
    expect(html).toContain("katex-display");
    expect(html).not.toContain("\\(");
    expect(html).not.toContain("\\[");
  });

  it("keeps ordinary text escaped and converts Anki line breaks", () => {
    const html = renderToStaticMarkup(
      <MathText text={'<img src=x onerror="alert(1)"><br>Next line'} />,
    );
    expect(html).toContain("&lt;img");
    expect(html).toContain("Next line");
    expect(html).not.toContain("<img");
  });

  it("shows unsupported expressions verbatim without breaking the card", () => {
    const html = renderToStaticMarkup(
      <MathText text={"Broken \\(\\frac{1}{\\) still visible"} />,
    );
    expect(html).toContain("\\(\\frac{1}{\\)");
    expect(html).toContain("still visible");
  });

  it("does not trust arbitrary URLs embedded in LaTeX", () => {
    const html = renderToStaticMarkup(
      <MathText text={"\\(\\href{javascript:alert(1)}{click}\\)"} />,
    );
    expect(html).not.toContain('href="javascript:');
  });
});
