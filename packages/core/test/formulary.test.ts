import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Formulary, colorSymbols, hasErrors, inline, renderFormularyHtml, validateFormulary } from "../src";

const f = Formulary.parse(JSON.parse(readFileSync(join(__dirname, "../../../examples/formulario-scomposizioni.json"), "utf8")));

describe("formulario quaderno", () => {
  it("l'esempio è valido", () => {
    expect(validateFormulary(f).filter((i) => i.level === "error")).toEqual([]);
    expect(hasErrors(validateFormulary(f))).toBe(false);
  });
  it("colora solo i simboli indicati e non rompe le macro", () => {
    const s = colorSymbols("\\frac{a}{b} + ab", [{ sym: "a" }, { sym: "b" }]);
    expect(s).toContain("\\frac{\\textcolor");
    expect(s.startsWith("\\frac{")).toBe(true);
    expect(colorSymbols("\\Delta=b", [{ sym: "\\Delta" }])).toContain("\\textcolor{#DC2626}{\\Delta}");
  });
  it("inline gestisce evidenziatore e formule", () => {
    expect(inline("==x== e $a^2$")).toContain('class="hl"');
    expect(inline("<b>")).toContain("&lt;b&gt;");
  });
  it("produce pagine con le sezioni", () => {
    const html = renderFormularyHtml(f);
    expect(html).toContain("nb-page");
    expect(html).toContain("Scomposizioni");
    expect(html).not.toContain("ParseError");
  });
  it("segnala tabella con righe storte", () => {
    const bad = structuredClone(f);
    bad.cards[bad.cards.length - 1].table!.rows[0].pop();
    expect(hasErrors(validateFormulary(bad))).toBe(true);
  });
});
