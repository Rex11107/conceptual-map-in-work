import dagre from "@dagrejs/dagre";
import type { ConceptMap, MapNode } from "./schema";
import { CLASS_LABELS, STYLE } from "./style";

export type RenderOptions = {
  direction?: "TB" | "LR";
  showTitle?: boolean;
  showLegend?: boolean;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CHAR_W = 0.6; // larghezza media di un carattere (Verdana) in em
const textWidth = (s: string, px: number) => [...s].length * px * CHAR_W;

export function wrapText(text: string, maxChars = 20): string[] {
  if (text.includes("\n")) return text.split("\n");
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    if (cur && (cur + " " + w).length > maxChars) {
      out.push(cur);
      cur = w;
    } else cur = cur ? cur + " " + w : w;
  }
  if (cur) out.push(cur);
  return out;
}

type Box = { lines: string[]; w: number; h: number };

function measure(n: MapNode): Box {
  const px = STYLE.nodeFontPx;
  const lines = wrapText(n.text);
  if (n.emoji) lines[0] = `${n.emoji} ${lines[0]}`;
  const w = Math.max(80, ...lines.map((l) => textWidth(l, px))) + 34;
  const h = lines.length * px * 1.3 + 20;
  return { lines, w: Math.round(w), h: Math.round(h) };
}

function edgePoint(c: { x: number; y: number; w: number; h: number }, to: { x: number; y: number }) {
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  const sx = dx === 0 ? Infinity : c.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : c.h / 2 / Math.abs(dy);
  const t = Math.min(sx, sy);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

function smooth(points: { x: number; y: number }[]): string {
  const f = (n: number) => Math.round(n * 10) / 10;
  const p = points;
  if (p.length < 3) return `M${f(p[0].x)},${f(p[0].y)} L${f(p[p.length - 1].x)},${f(p[p.length - 1].y)}`;
  let d = `M${f(p[0].x)},${f(p[0].y)}`;
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i].x + p[i + 1].x) / 2;
    const my = (p[i].y + p[i + 1].y) / 2;
    d += ` Q${f(p[i].x)},${f(p[i].y)} ${f(mx)},${f(my)}`;
  }
  d += ` L${f(p[p.length - 1].x)},${f(p[p.length - 1].y)}`;
  return d;
}

export function renderMapSvg(map: ConceptMap, opts: RenderOptions = {}): { svg: string; width: number; height: number } {
  const dir = opts.direction ?? "TB";
  const showTitle = opts.showTitle ?? true;
  const showLegend = opts.showLegend ?? true;
  const edgePx = STYLE.edgeFontPx;

  const boxes = new Map<string, Box>();
  for (const n of map.nodes) boxes.set(n.id, measure(n));

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: dir, nodesep: dir === "TB" ? 26 : 22, ranksep: 46, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of map.nodes) g.setNode(n.id, { width: boxes.get(n.id)!.w, height: boxes.get(n.id)!.h });
  const tree = map.links.filter((l) => l.kind === "tree" && boxes.has(l.from) && boxes.has(l.to));
  for (const l of tree)
    g.setEdge(l.from, l.to, { label: l.label, width: textWidth(l.label, edgePx) + 12, height: 22, labelpos: "c" });
  dagre.layout(g);

  const gw = g.graph().width ?? 600;
  const gh = g.graph().height ?? 400;
  let minX = 0;
  let minY = 0;
  let maxX = gw;
  let maxY = gh;

  const body: string[] = [];
  const labels: string[] = [];
  const bg = STYLE.bg;

  // frecce gerarchiche
  for (const l of tree) {
    const e = g.edge(l.from, l.to);
    body.push(
      `<path d="${smooth(e.points)}" fill="none" stroke="${STYLE.edgeColor}" stroke-width="2.2" marker-end="url(#arr)"/>`,
    );
    const w = textWidth(l.label, edgePx) + 10;
    labels.push(
      `<rect x="${(e.x - w / 2).toFixed(1)}" y="${(e.y - 11).toFixed(1)}" width="${w.toFixed(1)}" height="22" rx="4" fill="${bg}"/>` +
        `<text x="${e.x.toFixed(1)}" y="${e.y.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="${edgePx}" fill="${STYLE.linkText}">${esc(l.label)}</text>`,
    );
  }

  // frecce trasversali (tratteggiate)
  for (const l of map.links.filter((x) => x.kind === "cross" && boxes.has(x.from) && boxes.has(x.to))) {
    const a = g.node(l.from);
    const b = g.node(l.to);
    const pa = edgePoint({ x: a.x, y: a.y, w: a.width, h: a.height }, b);
    const pb = edgePoint({ x: b.x, y: b.y, w: b.width, h: b.height }, a);
    const mx = (pa.x + pb.x) / 2;
    const my = (pa.y + pb.y) / 2;
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy) || 1;
    const off = Math.min(80, 30 + len * 0.18);
    const cx = mx - (dy / len) * off;
    const cy = my + (dx / len) * off;
    const lx = 0.25 * pa.x + 0.5 * cx + 0.25 * pb.x;
    const ly = 0.25 * pa.y + 0.5 * cy + 0.25 * pb.y;
    minX = Math.min(minX, cx - 20, lx - 60);
    maxX = Math.max(maxX, cx + 20, lx + 60);
    minY = Math.min(minY, cy - 20);
    maxY = Math.max(maxY, cy + 20);
    body.push(
      `<path d="M${pa.x.toFixed(1)},${pa.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${pb.x.toFixed(1)},${pb.y.toFixed(1)}" fill="none" stroke="${STYLE.crossColor}" stroke-width="2.2" stroke-dasharray="7 5" marker-end="url(#arrx)"/>`,
    );
    const w = textWidth(l.label, edgePx) + 10;
    labels.push(
      `<rect x="${(lx - w / 2).toFixed(1)}" y="${(ly - 11).toFixed(1)}" width="${w.toFixed(1)}" height="22" rx="4" fill="${bg}"/>` +
        `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="${edgePx}" fill="${STYLE.crossColor}">${esc(l.label)}</text>`,
    );
  }

  // nodi
  const px = STYLE.nodeFontPx;
  for (const n of map.nodes) {
    const nd = g.node(n.id);
    const bx = boxes.get(n.id)!;
    const c = STYLE.classes[n.cls];
    const x0 = nd.x - nd.width / 2;
    const y0 = nd.y - nd.height / 2;
    body.push(
      `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${nd.width}" height="${nd.height}" rx="12" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2.6"/>`,
    );
    bx.lines.forEach((ln, i) => {
      const ty = y0 + 10 + (i + 0.5) * px * 1.3;
      body.push(
        `<text x="${nd.x.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="${px}" fill="${c.text}"${c.bold ? ' font-weight="700"' : ""}>${esc(ln)}</text>`,
      );
    });
  }

  // intestazione e legenda
  const head: string[] = [];
  const top = showTitle ? 58 : 0;
  const hy = minY - top; // origine verticale dell'intestazione
  if (showTitle) {
    head.push(
      `<text x="${minX + 24}" y="${hy + 34}" font-size="28" font-weight="700" fill="${STYLE.formulary.title}">${esc(map.title)}</text>`,
    );
    const src = [map.source?.book, map.source?.pages].filter(Boolean).join(", ");
    if (src)
      head.push(
        `<text x="${maxX - 24}" y="${hy + 32}" text-anchor="end" font-size="14" fill="#555555">${esc("Fonte: " + src)}</text>`,
      );
    head.push(`<line x1="${minX + 24}" y1="${hy + 46}" x2="${maxX - 24}" y2="${hy + 46}" stroke="#999999" stroke-width="2" stroke-dasharray="6 4"/>`);
  }
  const legend: string[] = [];
  let bottom = 0;
  if (showLegend) {
    const y = gh + 18;
    let x = minX + 24;
    for (const k of ["center", "l1", "l2", "extra"] as const) {
      const c = STYLE.classes[k];
      const label = CLASS_LABELS[k];
      const w = textWidth(label, 13) + 20;
      legend.push(
        `<rect x="${x}" y="${y}" width="${w.toFixed(0)}" height="24" rx="7" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2"/>` +
          `<text x="${(x + w / 2).toFixed(0)}" y="${y + 12}" text-anchor="middle" dominant-baseline="central" font-size="13" fill="${c.text}">${esc(label)}</text>`,
      );
      x += w + 12;
    }
    legend.push(
      `<line x1="${x}" y1="${y + 12}" x2="${x + 34}" y2="${y + 12}" stroke="${STYLE.crossColor}" stroke-width="2.2" stroke-dasharray="7 5"/>` +
        `<text x="${x + 42}" y="${y + 12}" dominant-baseline="central" font-size="13" fill="${STYLE.text}">collegamento tra rami</text>`,
    );
    maxX = Math.max(maxX, x + 42 + textWidth("collegamento tra rami", 13) + 24);
    bottom = 56;
  }

  const width = Math.ceil(maxX - minX);
  const height = Math.ceil(maxY - minY + top + bottom);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY - top} ${width} ${height}" width="${width}" height="${height}" font-family="${STYLE.fontFamily}">` +
    `<defs>` +
    `<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${STYLE.edgeColor}"/></marker>` +
    `<marker id="arrx" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${STYLE.crossColor}"/></marker>` +
    `</defs>` +
    `<rect x="${minX}" y="${minY - top}" width="${width}" height="${height}" fill="${bg}"/>` +
    head.join("") +
    body.join("") +
    labels.join("") +
    legend.join("") +
    `</svg>`;
  return { svg, width, height };
}
