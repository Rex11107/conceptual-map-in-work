import { LIMITS } from "./style";
import type { ConceptMap, Formulary, Issue } from "./schema";

export const words = (s: string): number =>
  s.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;

const LEAK = /(<[a-zA-Z/][^>]*>|\*\*|__|#{1,6}\s|```)/; // HTML/markdown che "sporca" il testo

/** Controlli sul contenuto di una mappa. Lo stile non si controlla: lo applica l'app. */
export function validateMap(m: ConceptMap): Issue[] {
  const out: Issue[] = [];
  const add = (level: Issue["level"], code: string, where: string, message: string) =>
    out.push({ level, code, where, message });

  const ids = new Set<string>();
  for (const n of m.nodes) {
    if (ids.has(n.id)) add("error", "dup-id", n.id, `id duplicato: ${n.id}`);
    ids.add(n.id);
  }

  const centers = m.nodes.filter((n) => n.cls === "center");
  if (centers.length !== 1)
    add("error", "one-center", "mappa", `serve esattamente 1 concetto centrale (trovati ${centers.length})`);

  const incoming = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const l of m.links) {
    const where = `${l.from}→${l.to}`;
    if (!ids.has(l.from) || !ids.has(l.to)) {
      add("error", "bad-link", where, "collegamento verso un nodo che non esiste");
      continue;
    }
    const w = words(l.label);
    if (w < LIMITS.linkWordsMin) add("error", "link-label", where, "manca la parola-legame");
    else if (w > LIMITS.linkWordsMax)
      add("warn", "link-long", where, `parola-legame di ${w} parole (max ${LIMITS.linkWordsMax}): "${l.label}"`);
    if (l.kind === "tree") {
      incoming.set(l.to, (incoming.get(l.to) ?? 0) + 1);
      children.set(l.from, [...(children.get(l.from) ?? []), l.to]);
    }
  }

  for (const n of m.nodes) {
    if (n.cls === "center") continue;
    const k = incoming.get(n.id) ?? 0;
    if (k !== 1)
      add("error", "tree", n.id, `il nodo ${n.id} deve avere esattamente 1 freccia gerarchica in ingresso (ne ha ${k})`);
  }

  // profondità dall'unico centro
  const depth = new Map<string, number>();
  if (centers.length === 1) {
    const q = [centers[0].id];
    depth.set(centers[0].id, 0);
    while (q.length) {
      const cur = q.shift()!;
      for (const c of children.get(cur) ?? []) {
        if (!depth.has(c)) {
          depth.set(c, depth.get(cur)! + 1);
          q.push(c);
        }
      }
    }
    for (const n of m.nodes)
      if (!depth.has(n.id)) add("error", "unreachable", n.id, `il nodo ${n.id} non è raggiungibile dal centro`);
  }
  const maxDepth = Math.max(0, ...depth.values());
  if (maxDepth > LIMITS.mapDepthMax)
    add("warn", "depth", "mappa", `${maxDepth} livelli (max ${LIMITS.mapDepthMax}): dividi in due mappe`);

  if (m.nodes.length < LIMITS.mapNodesMin || m.nodes.length > LIMITS.mapNodesMax)
    add("warn", "node-count", "mappa", `${m.nodes.length} nodi (previsti ${LIMITS.mapNodesMin}-${LIMITS.mapNodesMax})`);

  const expectedCls = ["center", "l1", "l2", "l3"];
  for (const n of m.nodes) {
    const w = words(n.text);
    if (n.cls !== "extra" && w > LIMITS.nodeWordsMax)
      add("warn", "node-long", n.id, `${w} parole (max ${LIMITS.nodeWordsMax}): "${n.text.replace(/\n/g, " ")}"`);
    if (LEAK.test(n.text)) add("warn", "style-leak", n.id, "il testo contiene HTML o markdown");
    const d = depth.get(n.id);
    if (d !== undefined && n.cls !== "extra" && d <= 3 && expectedCls[d] !== n.cls)
      add("warn", "class-depth", n.id, `classe ${n.cls} ma profondità ${d} (atteso ${expectedCls[d]})`);
    if (n.cls === "l1" && !n.emoji) add("warn", "emoji", n.id, "il livello 1 richiede un'emoji");
  }
  return out;
}

const emptyFrac = /\\frac\s*\{\s*\}|\\frac\s*\{[^{}]*\}\s*\{\s*\}|_{2,}/;

function balanced(s: string): boolean {
  let d = 0;
  for (const ch of s) {
    if (ch === "{") d++;
    if (ch === "}") d--;
    if (d < 0) return false;
  }
  return d === 0;
}

/** Controlli sul contenuto di un formulario. */
export function validateFormulary(f: Formulary): Issue[] {
  const out: Issue[] = [];
  const add = (level: Issue["level"], code: string, where: string, message: string) =>
    out.push({ level, code, where, message });
  const ids = new Set<string>();
  for (const c of f.cards) {
    if (ids.has(c.id)) add("error", "dup-id", c.id, "id scheda duplicato");
    ids.add(c.id);
    const formulas = [c.main, ...c.derived];
    for (const t of formulas) {
      if (emptyFrac.test(t)) add("error", "empty-fraction", c.id, `frazione con parti vuote: ${t}`);
      if (!balanced(t)) add("error", "braces", c.id, `parentesi graffe non bilanciate: ${t}`);
    }
    for (const s of c.symbols)
      if (!s.meaning.trim()) add("error", "symbol-meaning", c.id, `simbolo senza significato: ${s.sym}`);
    for (const [k, t] of [
      ["when", c.when],
      ["conditions", c.conditions],
      ["warning", c.warning],
    ] as const) {
      if (t && words(t) > LIMITS.sentenceWordsMax)
        add("warn", "sentence-long", `${c.id}.${k}`, `${words(t)} parole (max ${LIMITS.sentenceWordsMax})`);
      if (t && LEAK.test(t)) add("warn", "style-leak", `${c.id}.${k}`, "il testo contiene HTML o markdown");
    }
    const labels = new Set<string>();
    for (const d of c.drawings) {
      if (labels.has(d.label)) add("warn", "dup-label", c.id, `etichetta disegno duplicata: ${d.label}`);
      labels.add(d.label);
      if (!d.smiles && !d.tex && !d.text) add("warn", "empty-drawing", c.id, `disegno ${d.label} vuoto`);
    }
  }
  return out;
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === "error");

export const formatIssues = (issues: Issue[]): string =>
  issues.map((i) => `- [${i.level}] ${i.where}: ${i.message}`).join("\n");
