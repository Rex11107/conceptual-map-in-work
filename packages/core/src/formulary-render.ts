import katex from "katex";
import type { FormCard, Formulary } from "./schema";

/**
 * Preset "quaderno": carta a quadretti, titoli colorati, formula principale in una staffa colorata,
 * lettere colorate per significato, evidenziatore giallo, note piccole in grigio.
 * Il modello non sceglie nulla di questo: tutto viene da qui.
 */
export const NOTEBOOK = {
  paper: "#FFFFFF",
  grid: "#DCE3F5",
  margin: "#F3B6B6",
  ink: "#222222",
  grey: "#6B7280",
  highlight: "#FEF08A",
  fontFamily: "'Gaegu', 'Comic Sans MS', cursive",
  sectionColors: ["#DC2626", "#1D4ED8", "#0F766E", "#7E22CE", "#EA580C", "#15803D"],
  bracketColors: ["#7E22CE", "#92400E", "#3730A3", "#0E7490", "#0284C7", "#BE185D"],
  symbolColors: ["#DC2626", "#1D4ED8", "#15803D", "#EA580C", "#0D9488", "#7E22CE"],
  pageHeightMm: 297,
  usableMm: 255,
} as const;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function tex(src: string, display = false): string {
  try {
    return katex.renderToString(src, { throwOnError: false, displayMode: display, output: "html", strict: "ignore" });
  } catch {
    return `<code>${esc(src)}</code>`;
  }
}

/** Testo con $formule$ e ==evidenziato==. */
export function inline(text: string): string {
  const parts = text.split(/(\$[^$]+\$)/g);
  return parts
    .map((p) => {
      if (p.length > 1 && p.startsWith("$") && p.endsWith("$")) return tex(p.slice(1, -1));
      return esc(p).replace(/==(.+?)==/g, '<mark class="hl">$1</mark>');
    })
    .join("");
}

/** Colora nella formula i simboli elencati (solo simboli di una lettera o macro greche). */
export function colorSymbols(src: string, symbols: { sym: string }[]): string {
  let out = src;
  symbols.forEach((s, i) => {
    const sym = s.sym.trim();
    const color = NOTEBOOK.symbolColors[i % NOTEBOOK.symbolColors.length];
    let re: RegExp | null = null;
    if (/^[A-Za-z]$/.test(sym)) re = new RegExp(`(?<![\\\\A-Za-z])${sym}(?![A-Za-z])`, "g");
    else if (/^\\[A-Za-z]+$/.test(sym)) re = new RegExp(`${sym.replace(/\\/g, "\\\\")}(?![A-Za-z])`, "g");
    if (re) out = out.replace(re, (m) => `\\textcolor{${color}}{${m}}`);
  });
  return out;
}

function symbolsHtml(card: FormCard): string {
  if (!card.symbols.length) return "";
  const rows = card.symbols
    .map((s, i) => {
      const color = NOTEBOOK.symbolColors[i % NOTEBOOK.symbolColors.length];
      const unit = s.unit ? ` <span class="unit">[${inline(s.unit)}]</span>` : "";
      return `<div class="sym"><span class="symk" style="color:${color}">${tex(s.sym)}</span> → ${inline(s.meaning)}${unit}</div>`;
    })
    .join("");
  return `<div class="syms">${rows}</div>`;
}

function cardHtml(card: FormCard, idx: number): string {
  const bc = NOTEBOOK.bracketColors[idx % NOTEBOOK.bracketColors.length];
  const f = (t: string) => tex(colorSymbols(t, card.symbols), true);
  const side: string[] = [];
  const symbols = symbolsHtml(card);
  if (symbols) side.push(symbols);
  for (const n of card.notes) side.push(`<div class="note">${inline(n)}</div>`);
  const small: string[] = [];
  if (card.when) small.push(`<div><b>quando:</b> ${inline(card.when)}</div>`);
  if (card.conditions) small.push(`<div><b>condizioni:</b> ${inline(card.conditions)}</div>`);
  if (card.warning) small.push(`<div class="warn"><b>attenzione:</b> ${inline(card.warning)}</div>`);
  if (card.example) small.push(`<div><b>es.</b> ${inline(card.example)}</div>`);

  const table = card.table
    ? `<table class="tb"><thead><tr>${card.table.head.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${card.table.rows
        .map((r) => `<tr>${r.map((c, k) => (k === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join("")}</tr>`)
        .join("")}</tbody></table>`
    : "";
  const steps = card.steps.length ? `<ol class="steps">${card.steps.map((s) => `<li>${inline(s)}</li>`).join("")}</ol>` : "";
  const drawings = card.drawings
    .map((d) => {
      const body = d.tex ? tex(d.tex, true) : d.text ? inline(d.text) : d.smiles ? `<code>${esc(d.smiles)}</code>` : "";
      return `<div class="draw"><b>${esc(d.label)}</b> ${body}${d.caption ? `<div class="cap">${inline(d.caption)}</div>` : ""}</div>`;
    })
    .join("");

  const wide = card.main.length > 34 || card.derived.some((d) => d.length > 55) || card.main.includes("\\text");
  return `<article class="card${wide ? " wide" : ""}" style="--bc:${bc}">
  <h3 class="cname">${esc(card.name)}</h3>
  <div class="main"><div class="mainf">${f(card.main)}</div>${card.derived.map((d) => `<div class="derf">${f(d)}</div>`).join("")}</div>
  ${side.length ? `<div class="side">${side.join("")}</div>` : ""}
  ${steps}${table}${drawings}
  ${small.length ? `<div class="small">${small.join("")}</div>` : ""}
  ${card.rule ? `<div class="rule">${inline(card.rule)}</div>` : ""}
</article>`;
}

/** Stima grossolana dell'altezza (mm) per spezzare in pagine senza tagliare le schede. */
function estimateMm(c: FormCard): number {
  let h = 8 + 14 + c.derived.length * 11 + 6;
  const side = c.symbols.length * 6 + c.notes.length * 6;
  h += Math.max(0, side - (14 + c.derived.length * 11));
  h += c.steps.length * 7;
  if (c.table) h += 9 + c.table.rows.length * 12;
  h += c.drawings.length * 22;
  h += [c.when, c.conditions, c.warning, c.example].filter(Boolean).length * 6;
  if (c.rule) h += 14;
  if (c.section) h += 14;
  return h;
}

export const NOTEBOOK_CSS = `
@page { size: A4; margin: 0; }
.nb-root { font-family: ${NOTEBOOK.fontFamily}; color: ${NOTEBOOK.ink}; }
.nb-root * { box-sizing: border-box; }
.nb-page { position: relative; width: 210mm; min-height: ${NOTEBOOK.pageHeightMm}mm; padding: 14mm 12mm 12mm 26mm; margin: 0 auto 8mm; background-color: ${NOTEBOOK.paper};
  background-image: linear-gradient(${NOTEBOOK.grid} 1px, transparent 1px), linear-gradient(90deg, ${NOTEBOOK.grid} 1px, transparent 1px);
  background-size: 5mm 5mm; box-shadow: 0 1px 6px rgba(0,0,0,.25); break-after: page; overflow: hidden; }
.nb-page::before { content:""; position:absolute; left:19mm; top:0; bottom:0; width:0.4mm; background:${NOTEBOOK.margin}; }
.nb-page::after { content:""; position:absolute; left:5mm; top:0; bottom:0; width:5mm;
  background: radial-gradient(circle at 2.5mm 5mm, #9CA3AF 1.5mm, transparent 1.7mm); background-size: 5mm 15mm; }
@media print { .nb-page { margin:0; box-shadow:none; } body { background:#fff; } }
.nb-root .doc-title { font-size: 11mm; font-weight: 700; margin: 0 0 3mm; color: #1E3A8A; letter-spacing: .5mm; }
.nb-root .doc-src { font-size: 4mm; color: ${NOTEBOOK.grey}; margin: -2mm 0 4mm; }
.nb-root .sec { font-size: 8.5mm; font-weight: 700; letter-spacing: 1mm; text-transform: uppercase; margin: 6mm 0 3mm; padding-bottom: 1mm; border-bottom: 0.5mm dashed #9CA3AF; }
.nb-root .card { margin: 0 0 5mm; padding-left: 4mm; border-left: 0.8mm solid var(--bc); position: relative; break-inside: avoid; display: grid; grid-template-columns: minmax(0,1fr) minmax(0,0.8fr); gap: 1mm 6mm; align-items: start; }
.nb-root .card::before { content:""; position:absolute; left:-1.6mm; top:0; width:2.4mm; height:2.4mm; border-radius:50%; background: var(--bc); }
.nb-root .cname { grid-column: 1 / -1; margin: 0; font-size: 5mm; font-weight: 400; letter-spacing: .8mm; text-transform: uppercase; color: var(--bc); }
.nb-root .main { grid-column: 1; }
.nb-root .mainf { font-size: 6.2mm; border-bottom: 0.7mm solid var(--bc); padding-bottom: 1mm; margin-bottom: 1.5mm; display:inline-block; max-width:100%; }
.nb-root .derf { font-size: 5.4mm; }
.nb-root .mainf .katex-display, .nb-root .derf .katex-display { margin: 0.5em 0; text-align: left; }
.nb-root .mainf .katex-display > .katex, .nb-root .derf .katex-display > .katex { text-align: left; }
.nb-root .card.wide .main { grid-column: 1 / -1; } .nb-root .card.wide .side { grid-column: 1 / -1; grid-row: auto; margin-top: 1mm; }
.nb-root .card.wide .mainf { font-size: 5.4mm; }
.nb-root .side { grid-column: 2; grid-row: 2 / span 2; font-size: 4.3mm; line-height: 1.35; }
.nb-root .sym { margin-bottom: 0.6mm; } .nb-root .symk { font-size: 5mm; }
.nb-root .unit { color: ${NOTEBOOK.grey}; }
.nb-root .note { color: ${NOTEBOOK.grey}; font-size: 4mm; margin-top: 1mm; }
.nb-root .steps { grid-column: 1 / -1; margin: 1mm 0; padding-left: 6mm; font-size: 4.6mm; line-height: 1.35; }
.nb-root .tb { grid-column: 1 / -1; border-collapse: collapse; font-size: 4.8mm; margin: 1mm 0; background:#fff; }
.nb-root .tb th, .nb-root .tb td { border: 0.35mm solid #222; padding: 0.8mm 3mm; text-align: center; }
.nb-root .draw { grid-column: 1 / -1; font-size: 4.8mm; } .nb-root .cap { color: ${NOTEBOOK.grey}; font-size: 3.8mm; }
.nb-root .small { grid-column: 1 / -1; font-size: 4mm; color: #374151; border-top: 0.3mm dashed #9CA3AF; padding-top: 1mm; line-height: 1.3; }
.nb-root .small .warn b { color: #B91C1C; }
.nb-root .rule { grid-column: 1 / -1; font-size: 3.9mm; color: ${NOTEBOOK.grey}; border-top: 0.3mm dashed #9CA3AF; padding-top: 1mm; margin-top: 1mm; }
.nb-root .hl { background: ${NOTEBOOK.highlight}; padding: 0 0.8mm; border-radius: 1mm; color: inherit; }
.nb-root .checks { font-size: 4mm; color: #7C2D12; background: #FFF7ED; border: 0.3mm solid #FDBA74; padding: 2mm; margin-top: 4mm; }
`;

/** Restituisce l'HTML (senza <html>) con le pagine del quaderno; il CSS va incluso una volta (NOTEBOOK_CSS + katex.css). */
export function renderFormularyHtml(f: Formulary): string {
  const pages: string[][] = [[]];
  let used = 0;
  let sectionIdx = -1;
  f.cards.forEach((c, i) => {
    let block = "";
    if (c.section) {
      sectionIdx++;
      const color = NOTEBOOK.sectionColors[sectionIdx % NOTEBOOK.sectionColors.length];
      block += `<h2 class="sec" style="color:${color}">${esc(c.section)}</h2>`;
    }
    block += cardHtml(c, i);
    const h = estimateMm(c);
    const head = pages.length === 1 && pages[0].length === 0 ? 24 : 0;
    if (used + h + head > NOTEBOOK.usableMm && pages[pages.length - 1].length) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(block);
    used += h + head;
  });
  const src = [f.source?.book, f.source?.pages].filter(Boolean).join(", ");
  const checks = f.checks.length
    ? `<div class="checks"><b>Da verificare:</b><ul>${f.checks
        .map((c) => `<li>[${c.kind}] ${esc(c.where)}${c.proposal ? ": " + inline(c.proposal) : ""}${c.reason ? " — " + inline(c.reason) : ""}</li>`)
        .join("")}</ul></div>`
    : "";
  return (
    `<div class="nb-root">` +
    pages
      .map(
        (p, i) =>
          `<section class="nb-page">${i === 0 ? `<h1 class="doc-title">${esc(f.title)}</h1>${src ? `<div class="doc-src">Fonte: ${esc(src)}</div>` : ""}` : ""}${p.join("")}${i === pages.length - 1 ? checks : ""}</section>`,
      )
      .join("") +
    `</div>`
  );
}
