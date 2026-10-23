import type { ConceptMap } from "../src/schema";

export const goodMap: ConceptMap = {
  schema: "concept-map/1",
  title: "Il legame covalente",
  nodes: [
    { id: "C0", cls: "center", text: "Legame covalente" },
    { id: "A1", cls: "l1", text: "Condivisione elettroni", emoji: "🤝" },
    { id: "A2", cls: "l1", text: "Tipi di legame", emoji: "🔗" },
    { id: "A3", cls: "l1", text: "Polarità", emoji: "🧲" },
    { id: "B1", cls: "l2", text: "Coppia di legame" },
    { id: "B2", cls: "l2", text: "Singolo" },
    { id: "B3", cls: "l2", text: "Doppio" },
    { id: "B4", cls: "l2", text: "Triplo" },
    { id: "B5", cls: "l2", text: "Elettronegatività" },
    { id: "D1", cls: "extra", text: "Nel 1916 Lewis propone la regola dell'ottetto" },
  ],
  links: [
    { from: "C0", to: "A1", label: "avviene per", kind: "tree" },
    { from: "C0", to: "A2", label: "può essere", kind: "tree" },
    { from: "C0", to: "A3", label: "dipende da", kind: "tree" },
    { from: "A1", to: "B1", label: "forma", kind: "tree" },
    { from: "A2", to: "B2", label: "esempio", kind: "tree" },
    { from: "A2", to: "B3", label: "esempio", kind: "tree" },
    { from: "A2", to: "B4", label: "esempio", kind: "tree" },
    { from: "A3", to: "B5", label: "misurata da", kind: "tree" },
    { from: "B1", to: "D1", label: "nel 1916", kind: "tree" },
    { from: "B5", to: "B2", label: "influenza", kind: "cross" },
  ],
} as ConceptMap;
