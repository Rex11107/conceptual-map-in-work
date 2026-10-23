/**
 * Unica fonte di verità per lo stile (DSA).
 * Il modello AI NON sceglie colori, font o layout: l'app li applica da qui.
 * Questo garantisce lo stesso aspetto tra capitoli e tra modelli diversi.
 */
export const STYLE = {
  bg: "#FFFDF5",
  text: "#222222",
  fontFamily: "Verdana, Arial, sans-serif",
  nodeFontPx: 18, // minimo DSA per i nodi
  edgeFontPx: 15,
  classes: {
    center: { fill: "#1E3A8A", stroke: "#1E3A8A", text: "#FFFFFF", bold: true },
    l1: { fill: "#BFDBFE", stroke: "#1E3A8A", text: "#222222", bold: false },
    l2: { fill: "#BBF7D0", stroke: "#166534", text: "#222222", bold: false },
    l3: { fill: "#FEF08A", stroke: "#854D0E", text: "#222222", bold: false },
    extra: { fill: "#E9D5FF", stroke: "#6B21A8", text: "#222222", bold: false },
  },
  linkText: "#1E3A8A",
  crossColor: "#6B21A8",
  edgeColor: "#333333",
  formulary: {
    title: "#1E3A8A",
    main: "#B91C1C",
    derived: "#166534",
    symbols: "#1E3A8A",
    noteBg: "#FEF08A",
  },
} as const;

export type NodeClassKey = keyof typeof STYLE.classes;

export const CLASS_LABELS: Record<NodeClassKey, string> = {
  center: "concetto centrale",
  l1: "livello 1",
  l2: "livello 2",
  l3: "livello 3",
  extra: "formule, esempi, termini",
};

/** Limiti di contenuto: usati sia nel prompt sia nei controlli automatici. */
export const LIMITS = {
  mapNodesMin: 10,
  mapNodesMax: 15,
  nodeWordsMax: 7,
  linkWordsMin: 1,
  linkWordsMax: 3,
  mapDepthMax: 4,
  sentenceWordsMax: 10,
} as const;
