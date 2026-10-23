/**
 * Benchmark dei modelli sullo STESSO materiale.
 *
 *   OPENROUTER_API_KEY=... npm run bench -- --models openrouter:deepseek/deepseek-chat,openrouter:openai/gpt-4o-mini \
 *       --input capitolo.txt --concepts "Legame covalente,Isomeria" --runs 3
 *   npm run bench -- --mock          # prova offline senza chiavi
 *
 * Provider: openrouter | openai | deepseek | ollama  (chiave da <PROVIDER>_API_KEY).
 * Per ogni modello misura: % di mappe valide al primo colpo, tentativi medi, warning, nodi, tempo, token.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateMap, makeOpenAiChat, PRESETS, renderMapSvg, type ChatFn, type ConceptMap } from "@cmiw/core";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d = "") => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const mock = flag("mock");
const runs = Number(opt("runs", "3"));
const out = opt("out", "bench-results");
const material = mock ? "Materiale di prova." : readFileSync(opt("input"), "utf8");
const concepts = opt("concepts", "Concetto 1").split(",").map((s) => s.trim());
const models = (mock ? "mock:demo" : opt("models")).split(",").filter(Boolean);

function mockChat(): ChatFn {
  let n = 0;
  return async () => {
    n++;
    const m: ConceptMap = {
      schema: "concept-map/1",
      title: "Demo",
      nodes: [
        { id: "C0", cls: "center", text: "Concetto" },
        ...[1, 2, 3].map((i) => ({ id: `A${i}`, cls: "l1" as const, text: `Ramo ${i}`, emoji: n % 2 ? undefined : "🔗" })),
        ...[1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: `B${i}`, cls: "l2" as const, text: `Dettaglio ${i}` })),
      ],
      links: [
        ...[1, 2, 3].map((i) => ({ from: "C0", to: `A${i}`, label: "include", kind: "tree" as const })),
        ...[1, 2, 3, 4, 5, 6, 7].map((i) => ({ from: `A${((i - 1) % 3) + 1}`, to: `B${i}`, label: "ha", kind: "tree" as const })),
      ],
    };
    return { text: JSON.stringify(m), usage: { prompt: 100, completion: 200 } };
  };
}

function chatFor(spec: string): ChatFn {
  if (spec.startsWith("mock:")) return mockChat();
  const [prov, ...rest] = spec.split(":");
  const model = rest.join(":");
  const p = PRESETS[prov as keyof typeof PRESETS];
  if (!p) throw new Error(`provider sconosciuto: ${prov}`);
  const apiKey = process.env[`${prov.toUpperCase()}_API_KEY`] ?? (prov === "ollama" ? "ollama" : "");
  if (!apiKey) throw new Error(`manca ${prov.toUpperCase()}_API_KEY`);
  return makeOpenAiChat({ baseUrl: p.baseUrl, apiKey, model });
}

mkdirSync(out, { recursive: true });
const rows: string[] = [];
const all: unknown[] = [];
for (const spec of models) {
  const chat = chatFor(spec);
  let ok = 0, clean = 0, attempts = 0, warns = 0, nodes = 0, ms = 0, tok = 0, total = 0, fails = 0;
  for (const c of concepts)
    for (let r = 0; r < runs; r++) {
      total++;
      const t0 = Date.now();
      try {
        const res = await generateMap(chat, { concept: c, material });
        ms += Date.now() - t0;
        attempts += res.attempts;
        tok += res.usage.prompt + res.usage.completion;
        if (res.ok) ok++;
        if (res.firstTryClean) clean++;
        warns += res.issues.filter((i) => i.level === "warn").length;
        nodes += res.value?.nodes.length ?? 0;
        if (res.value) writeFileSync(`${out}/${spec.replace(/[^\w.-]/g, "_")}_${total}.svg`, renderMapSvg(res.value).svg);
        all.push({ spec, concept: c, run: r, ok: res.ok, attempts: res.attempts, issues: res.issues });
      } catch (e) {
        fails++;
        console.error(`${spec}: ${(e as Error).message}`);
      }
    }
  const done = total - fails || 1;
  const pct = (x: number) => `${Math.round((100 * x) / total)}%`;
  rows.push(
    `| ${spec} | ${pct(clean)} | ${pct(ok)} | ${(attempts / done).toFixed(1)} | ${(warns / done).toFixed(1)} | ${(nodes / done).toFixed(1)} | ${(ms / done / 1000).toFixed(1)} s | ${Math.round(tok / done)} | ${fails} |`,
  );
}
const report =
  `# Benchmark mappe\n\nConcetti: ${concepts.join(", ")} · ripetizioni: ${runs}\n\n` +
  `| Modello | Valida al 1° colpo | Valida (con retry) | Tentativi medi | Warning medi | Nodi medi | Tempo | Token | Errori API |\n|---|---|---|---|---|---|---|---|---|\n` +
  rows.join("\n") + "\n";
writeFileSync(`${out}/report.md`, report);
writeFileSync(`${out}/results.json`, JSON.stringify(all, null, 1));
console.log(report);
