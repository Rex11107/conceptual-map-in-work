# ConceptualMap in Work

Genera **mappe concettuali** e **formulari** pensati per studenti con DSA a partire da piccoli capitoli (15–20 pagine), con modifica manuale. Funziona con qualunque API compatibile OpenAI (OpenRouter, OpenAI, DeepSeek, Ollama…). Versione web per PC e APK Android (Capacitor).

## Idea chiave: stile e continuità
Il modello **non decide l'aspetto**. Restituisce solo JSON (`concept-map/1`, `formulary/1`); colori, font, dimensioni e layout sono applicati dal codice (`packages/core/src/style.ts`, `render.ts`). Le regole di contenuto (10–15 nodi, ≤7 parole, parole-legame 1–3 parole, un solo centro, emoji sui nodi di livello 1…) sono **controllate dal codice** (`rules.ts`); se falliscono, gli errori esatti tornano al modello per la correzione (fino a 3 tentativi). Così il risultato è uguale qualunque modello usi.

## Struttura
- `packages/core` – schema (zod), regole, render SVG (dagre), client LLM, prompt, pipeline
- `packages/bench` – confronto fra modelli sullo stesso testo
- `apps/web` – interfaccia Vite + React (genera, modifica, controlli live, export JSON/SVG/PDF)
- `examples/maps` – 14 mappe del cap. 1 di chimica organica

## Comandi
```bash
npm install
npm test              # test + validazione degli esempi
npm run typecheck
npm run web           # sviluppo su http://localhost:5173
npm run build:web
# benchmark (chiavi: OPENROUTER_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY)
npm run bench -- --models openrouter:deepseek/deepseek-chat,openrouter:openai/gpt-4o-mini \
  --input capitolo.txt --concepts "Legame covalente,Isomeria" --runs 3
npm run bench -- --mock   # prova offline
```
Il report (`bench-results/report.md`) mostra, per modello, % di risultati validi al primo colpo, tentativi medi, warning, tempo e token.

## Android
Workflow manuale `Android APK (debug)` su GitHub Actions: scarica l'APK dagli artifact e installalo.

## Stato e limiti (onesti)
- Testato: core, regole, rendering, benchmark in modalità mock, build web.
- **Non testato**: chiamate reali ai modelli, interfaccia nel browser, workflow Pages/Android.
- Mancano ancora: lettura di PDF/foto (la trascrizione con visione è in `pipeline.ts`, non collegata alla UI), editor/render del formulario e disegno molecole da SMILES, esportazione PDF multipagina.
- Dal browser alcuni provider bloccano le richieste (CORS); OpenRouter funziona.

## Roadmap
1. Collegare trascrizione foto/PDF → outline → una mappa per concetto.
2. Render del formulario (KaTeX + OpenChemLib).
3. Modalità appunti.
4. Benchmark reale e scelta del modello per fase.
