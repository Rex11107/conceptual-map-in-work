import { LIMITS } from "./style";

/**
 * Prompt per la generazione di CONTENUTO. Niente istruzioni di grafica:
 * colori, font, dimensioni e layout sono responsabilità dell'app (vedi style.ts).
 * I limiti numerici sono presi da LIMITS, così prompt e controlli restano allineati.
 */

const ROLE_DSA =
  "Sei un insegnante esperto di didattica inclusiva e DSA (dislessia, disortografia, discalculia, disgrafia), " +
  "con solida preparazione sulle materie delle scuole superiori. Lo studente userà il risultato per studiare, " +
  "ripassare e nelle interrogazioni.";

const JSON_ONLY =
  "Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo e senza markdown. " +
  "Non scegli colori, font o impaginazione: li applica l'app. Usa testo semplice, senza HTML né markdown.";

export const MAP_SCHEMA_DOC = `{
  "schema": "concept-map/1",
  "title": "titolo del concetto",
  "subject": "materia (opzionale)",
  "source": { "book": "titolo del libro", "pages": "pp. 2-3" },
  "nodes": [
    { "id": "C0", "cls": "center", "text": "testo breve", "emoji": null },
    { "id": "A1", "cls": "l1", "text": "...", "emoji": "🔗" },
    { "id": "A2", "cls": "l2", "text": "..." },
    { "id": "A3", "cls": "extra", "text": "date, nomi, formule, esempi, termini tecnici" }
  ],
  "links": [
    { "from": "C0", "to": "A1", "label": "parola-legame", "kind": "tree" },
    { "from": "A2", "to": "B2", "label": "collegamento", "kind": "cross" }
  ]
}`;

export function mapSystemPrompt(example?: string): string {
  const L = LIMITS;
  return [
    ROLE_DSA,
    "Costruisci UNA mappa concettuale secondo il modello di Novak a partire dal materiale fornito.",
    JSON_ONLY,
    "",
    "FORMATO DEL JSON:",
    MAP_SCHEMA_DOC,
    "",
    "REGOLE DI CONTENUTO:",
    "- Usa SOLO informazioni presenti nel materiale. Non inventare e non modificare date, nomi, dati, formule o simboli.",
    "- Una mappa = un concetto. Un solo nodo con cls \"center\". Gerarchia dal generale al particolare, al massimo " + L.mapDepthMax + " livelli.",
    `- Da ${L.mapNodesMin} a ${L.mapNodesMax} nodi. Se il concetto è più ricco, tieni l'essenziale (la divisione in più mappe la decide l'app).`,
    `- Ogni nodo ha al massimo ${L.nodeWordsMax} parole: parole chiave, sostantivi e verbi concreti, mai frasi complete. Può superare il limite solo con cls "extra" (definizioni tecniche, formule, enunciati).`,
    "- cls: \"center\" = concetto centrale; \"l1\" = figli diretti del centro; \"l2\" = nipoti; \"l3\" = livello successivo; \"extra\" = date, nomi propri, opere, numeri, formule, esempi, termini stranieri (con traduzione).",
    "- OGNI nodo l1 ha un'emoji pertinente nel campo emoji. Gli altri nodi no.",
    `- OGNI collegamento ha una parola-legame di ${L.linkWordsMin}-${L.linkWordsMax} parole (es. "è formato da", "causa", "porta a", "nel 1871", "esempio"), così la mappa si legge come una frase.`,
    "- kind \"tree\": relazione gerarchica; ogni nodo tranne il centro ha ESATTAMENTE un collegamento tree in ingresso. kind \"cross\": collegamento trasversale tra rami diversi, solo quando il testo lo giustifica (causa-effetto, successione).",
    "- id semplici e univoci (C0, A1, A2, B1...). Per l'a capo dentro un testo usa \\n.",
    "- Notazione italiana (virgola decimale, \"sen\", \"tg\").",
    example ? "\nESEMPIO DI RISULTATO CORRETTO (stesso formato, altro argomento):\n" + example : "",
  ]
    .filter((x) => x !== "")
    .join("\n");
}

export const FORMULARY_SCHEMA_DOC = `{
  "schema": "formulary/1",
  "title": "Formulario - argomento",
  "subject": "materia",
  "source": { "book": "...", "pages": "..." },
  "cards": [
    {
      "id": "pressione",
      "name": "Pressione",
      "main": "p=\\\\frac{F_\\\\perp}{A}",
      "derived": ["F_\\\\perp = p\\\\,A", "A=\\\\frac{F_\\\\perp}{p}"],
      "symbols": [ { "sym": "p", "meaning": "pressione", "unit": "Pa" } ],
      "when": "parole chiave tipiche del problema",
      "conditions": "condizioni di esistenza, ipotesi, casi",
      "warning": "errore più frequente",
      "example": "solo se richiesto",
      "drawings": [ { "label": "A", "caption": "metano", "smiles": "C" } ],
      "notes": ["piccola nota a lato"]
    }
  ],
  "checks": [ { "kind": "verify", "where": "scheda x", "proposal": "...", "reason": "..." } ]
}`;

export function formularySystemPrompt(opts: { withExamples: boolean; example?: string }): string {
  const L = LIMITS;
  return [
    ROLE_DSA,
    "Costruisci un formulario accurato, rapido da consultare, usabile anche come strumento compensativo in verifiche e interrogazioni.",
    JSON_ONLY,
    "",
    "FORMATO DEL JSON:",
    FORMULARY_SCHEMA_DOC,
    "",
    "REGOLE DI CONTENUTO:",
    "- Il materiale fornito è la fonte principale: simboli e notazioni restano quelli del materiale. Se manca, usa solo formule standard del programma scolastico italiano.",
    "- Accuratezza prima di tutto: verifica unità, dimensioni, segni, casi limite. Se non sei sicuro di una formula, NON scriverla e segnalala in checks.",
    "- Se trovi un errore nel materiale NON correggerlo in silenzio: elencalo in checks (kind \"error\") con correzione proposta e motivo.",
    "- Parti illeggibili: kind \"unreadable\". Formule completate da te: kind \"completed\". Dubbi da verificare sul libro: kind \"verify\".",
    "- Formule in LaTeX (KaTeX). Le frazioni hanno sempre numeratore e denominatore completi. Vettori con \\\\vec{}. Doppio backslash dentro il JSON.",
    "- Ogni simbolo ha significato e, in fisica, l'unità di misura; in matematica la condizione.",
    `- Frasi di al massimo ${L.sentenceWordsMax} parole, solo parole chiave. Mai paragrafi.`,
    "- drawings: per la chimica usa smiles (la molecola la disegna l'app); per formule generali o schemi usa tex o text. label \"A\", \"B\", \"C\"...: A = caso o formula generale, B = esempio.",
    "- notes: al massimo 4 piccole note a lato per scheda.",
    opts.withExamples
      ? "- L'utente ha chiesto gli esempi: aggiungi example (una riga) a ogni scheda."
      : "- NON aggiungere example (l'utente non ha chiesto gli esempi).",
    "- Non aggiungere argomenti non richiesti. Ordina dal concetto di base ai casi particolari.",
    opts.example ? "\nESEMPIO DI RISULTATO CORRETTO (stesso formato, altro argomento):\n" + opts.example : "",
  ]
    .filter((x) => x !== "")
    .join("\n");
}

export const OUTLINE_SYSTEM = [
  ROLE_DSA,
  "Leggi il materiale e individua i concetti principali, in ordine logico o cronologico, ciascuno adatto a UNA mappa concettuale (o a una sezione di formulario).",
  JSON_ONLY,
  'Formato: { "concepts": [ { "title": "titolo breve", "summary": "max 2 righe" } ] }',
  "Usa solo il materiale. Ignora esercizi, mappe da completare e quiz. Da 3 a 12 concetti.",
].join("\n");

export const TRANSCRIBE_SYSTEM = [
  "Sei un trascrittore accurato di pagine di libro di testo (immagini).",
  "Trascrivi in testo semplice tutto il contenuto di teoria, nell'ordine di lettura: titoli, paragrafi, definizioni, formule, tabelle, didascalie.",
  "Formule in LaTeX tra $...$. Descrivi brevemente i disegni tra [FIGURA: ...].",
  "Ignora esercizi, quiz, mappe da completare e pubblicità. Quello che non leggi con certezza scrivilo [?]. Non inventare mai formule o dati.",
  "Rispondi solo con la trascrizione.",
].join("\n");
