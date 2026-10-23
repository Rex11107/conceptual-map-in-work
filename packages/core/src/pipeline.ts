import { ZodError, type ZodType } from "zod";
import { extractJson, type ChatFn, type Msg, type Usage } from "./llm";
import { formularySystemPrompt, mapSystemPrompt, OUTLINE_SYSTEM, TRANSCRIBE_SYSTEM } from "./prompts";
import { formatIssues, hasErrors, validateFormulary, validateMap } from "./rules";
import { ConceptMap, Formulary, Outline, type Issue } from "./schema";

export type GenResult<T> = {
  ok: boolean; // nessun errore (i warning possono restare)
  value?: T;
  issues: Issue[]; // problemi rimasti nell'ultimo tentativo
  attempts: number;
  firstTryClean: boolean; // al primo colpo: nessun errore e nessun warning
  usage: Usage;
  raw: string;
};

const zodIssues = (e: ZodError): Issue[] =>
  e.issues.map((i) => ({ level: "error", code: "schema", where: i.path.join(".") || "root", message: i.message }));

type Checked<T> = { value?: T; issues: Issue[] };

async function generateValidated<T>(
  chat: ChatFn,
  system: string,
  user: string,
  check: (json: unknown) => Checked<T>,
  maxAttempts = 3,
): Promise<GenResult<T>> {
  const msgs: Msg[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  const usage: Usage = { prompt: 0, completion: 0 };
  let raw = "";
  let last: Checked<T> = { issues: [] };
  let firstTryClean = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await chat(msgs, { json: true });
    raw = r.text;
    usage.prompt += r.usage?.prompt ?? 0;
    usage.completion += r.usage?.completion ?? 0;
    try {
      last = check(extractJson(raw));
    } catch (e) {
      last = { issues: [{ level: "error", code: "json", where: "risposta", message: String((e as Error).message) }] };
    }
    if (attempt === 1) firstTryClean = last.issues.length === 0;
    if (last.issues.length === 0 || attempt === maxAttempts) {
      return { ok: !hasErrors(last.issues), value: last.value, issues: last.issues, attempts: attempt, firstTryClean, usage, raw };
    }
    // un solo errore alla volta fa bene al modello: gli rimandiamo l'elenco preciso
    msgs.push({ role: "assistant", content: raw });
    msgs.push({
      role: "user",
      content:
        "Il JSON ha questi problemi:\n" +
        formatIssues(last.issues) +
        "\nCorreggi SOLO questi punti, senza cambiare il resto, e restituisci l'intero JSON corretto.",
    });
  }
  return { ok: false, issues: last.issues, attempts: maxAttempts, firstTryClean, usage, raw };
}

function parseWith<T>(schema: ZodType<T, any, any>, rules: (v: T) => Issue[]) {
  return (json: unknown): Checked<T> => {
    const p = schema.safeParse(json);
    if (!p.success) return { issues: zodIssues(p.error) };
    return { value: p.data, issues: rules(p.data) };
  };
}

export type MapInput = { concept: string; material: string; example?: string; subject?: string; source?: { book?: string; pages?: string } };

export function generateMap(chat: ChatFn, input: MapInput, maxAttempts = 3) {
  const user =
    `Concetto da mappare: ${input.concept}\n` +
    (input.subject ? `Materia: ${input.subject}\n` : "") +
    (input.source?.book ? `Libro: ${input.source.book}${input.source.pages ? ", " + input.source.pages : ""}\n` : "") +
    `\nMATERIALE:\n---\n${input.material}\n---`;
  return generateValidated(chat, mapSystemPrompt(input.example), user, parseWith(ConceptMap, validateMap), maxAttempts);
}

export type FormularyInput = { topic: string; material: string; withExamples?: boolean; example?: string; subject?: string };

export function generateFormulary(chat: ChatFn, input: FormularyInput, maxAttempts = 3) {
  const user =
    `Argomento: ${input.topic}\n` +
    (input.subject ? `Materia: ${input.subject}\n` : "") +
    `\nMATERIALE:\n---\n${input.material}\n---`;
  return generateValidated(
    chat,
    formularySystemPrompt({ withExamples: !!input.withExamples, example: input.example }),
    user,
    parseWith(Formulary, validateFormulary),
    maxAttempts,
  );
}

export function makeOutline(chat: ChatFn, material: string, maxAttempts = 2) {
  return generateValidated(
    chat,
    OUTLINE_SYSTEM,
    `MATERIALE:\n---\n${material}\n---`,
    parseWith(Outline, () => []),
    maxAttempts,
  );
}

/** Fase 1 per foto/PDF: trascrizione con un modello con visione. images = data URL (png/jpg). */
export async function transcribePages(chat: ChatFn, images: string[], hint = ""): Promise<{ text: string; usage?: Usage }> {
  const parts = [
    { type: "text" as const, text: hint || "Trascrivi queste pagine." },
    ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
  ];
  const r = await chat([
    { role: "system", content: TRANSCRIBE_SYSTEM },
    { role: "user", content: parts },
  ]);
  return { text: r.text, usage: r.usage };
}
