import { z } from "zod";

// ---------------------------------------------------------------- Mappa concettuale
export const NodeClass = z.enum(["center", "l1", "l2", "l3", "extra"]);

export const MapNode = z.object({
  id: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, "id: lettere, numeri, _"),
  cls: NodeClass,
  text: z.string().min(1),
  emoji: z.string().optional(),
});

export const MapLink = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().min(1),
  kind: z.enum(["tree", "cross"]).default("tree"),
});

export const Source = z
  .object({ book: z.string().optional(), pages: z.string().optional() })
  .optional();

export const ConceptMap = z.object({
  schema: z.literal("concept-map/1"),
  title: z.string().min(1),
  subject: z.string().optional(),
  source: Source,
  nodes: z.array(MapNode).min(2),
  links: z.array(MapLink).min(1),
});

export type ConceptMap = z.infer<typeof ConceptMap>;
export type MapNode = z.infer<typeof MapNode>;
export type MapLink = z.infer<typeof MapLink>;

// ---------------------------------------------------------------- Formulario
export const FormSymbol = z.object({
  sym: z.string().min(1),
  meaning: z.string().min(1),
  unit: z.string().optional(), // fisica: unità SI; matematica: condizione
});

export const Drawing = z.object({
  label: z.string().min(1).max(2), // "A", "B", "C"
  caption: z.string().optional(),
  smiles: z.string().optional(), // chimica: disegnata dall'app a partire dal SMILES
  tex: z.string().optional(), // formula o schema in LaTeX
  text: z.string().optional(),
});

export const FormCard = z.object({
  id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  name: z.string().min(1),
  main: z.string().min(1), // LaTeX
  derived: z.array(z.string()).default([]), // LaTeX, formule derivate/inverse
  symbols: z.array(FormSymbol).default([]),
  when: z.string().optional(), // parole chiave tipiche del problema
  conditions: z.string().optional(),
  warning: z.string().optional(),
  example: z.string().optional(), // solo se l'utente lo chiede
  drawings: z.array(Drawing).default([]),
  notes: z.array(z.string()).default([]), // piccole note a lato
});

export const CheckItem = z.object({
  kind: z.enum(["unreadable", "error", "completed", "verify"]),
  where: z.string(),
  proposal: z.string().optional(),
  reason: z.string().optional(),
});

export const Formulary = z.object({
  schema: z.literal("formulary/1"),
  title: z.string().min(1),
  subject: z.string().optional(),
  source: Source,
  cards: z.array(FormCard).min(1),
  checks: z.array(CheckItem).default([]),
});

export type Formulary = z.infer<typeof Formulary>;
export type FormCard = z.infer<typeof FormCard>;

// ---------------------------------------------------------------- Fasi della pipeline
export const Outline = z.object({
  concepts: z
    .array(z.object({ title: z.string().min(1), summary: z.string().default("") }))
    .min(1),
});
export type Outline = z.infer<typeof Outline>;

export type Issue = {
  level: "error" | "warn";
  code: string;
  where: string;
  message: string;
};
