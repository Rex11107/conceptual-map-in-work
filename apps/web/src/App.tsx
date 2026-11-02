import { useEffect, useMemo, useRef, useState } from "react";
import {
  ConceptMap, Formulary, PRESETS, generateFormulary, generateMap, hasErrors, makeOpenAiChat, makeOutline,
  renderFormularyHtml, renderMapSvg, transcribePages, validateFormulary, validateMap, NOTEBOOK_CSS,
  type ChatFn, type MapNode,
} from "@cmiw/core";
import { parseRange, pdfPageCount, readImage, readPdf, type PageData } from "./files";

type Settings = { preset: keyof typeof PRESETS; baseUrl: string; apiKey: string; model: string; visionModel: string };
const DEFAULT_SETTINGS: Settings = { preset: "openrouter", baseUrl: PRESETS.openrouter.baseUrl, apiKey: "", model: "deepseek/deepseek-chat", visionModel: "" };

function load<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
}
function save(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage non disponibile o pieno */ } }

const EMPTY_MAP: ConceptMap = {
  schema: "concept-map/1", title: "Nuova mappa",
  nodes: [{ id: "C0", cls: "center", text: "Concetto" }, { id: "A1", cls: "l1", text: "Ramo", emoji: "🔗" }],
  links: [{ from: "C0", to: "A1", label: "include", kind: "tree" }],
};

function download(name: string, data: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

type Mode = "map" | "formulary";

export function App() {
  const [s, setS] = useState<Settings>(() => load("cmiw.settings", DEFAULT_SETTINGS));
  const [mode, setMode] = useState<Mode>(() => load("cmiw.mode", "map"));
  const [maps, setMaps] = useState<ConceptMap[]>(() => load("cmiw.maps", [EMPTY_MAP]));
  const [sel, setSel] = useState(0);
  const [formulary, setFormulary] = useState<Formulary | null>(() => load("cmiw.formulary", null));
  const [formJson, setFormJson] = useState(() => (load<Formulary | null>("cmiw.formulary", null) ? JSON.stringify(load("cmiw.formulary", null), null, 1) : ""));
  const [formErr, setFormErr] = useState("");
  const [withExamples, setWithExamples] = useState(false);

  const [concept, setConcept] = useState("");
  const [material, setMaterial] = useState(() => load("cmiw.material", ""));
  const [outline, setOutline] = useState<{ title: string; summary: string; on: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [dir, setDir] = useState<"TB" | "LR">("TB");
  const [pdf, setPdf] = useState<File | null>(null);
  const [pdfPages, setPdfPages] = useState(0);
  const [range, setRange] = useState("");
  const photos = useRef<File[]>([]);

  const map = maps[sel] ?? EMPTY_MAP;
  const setMap = (m: ConceptMap) => setMaps(maps.map((x, i) => (i === sel ? m : x)));

  useEffect(() => save("cmiw.settings", s), [s]);
  useEffect(() => save("cmiw.mode", mode), [mode]);
  useEffect(() => save("cmiw.maps", maps), [maps]);
  useEffect(() => save("cmiw.material", material), [material]);
  useEffect(() => save("cmiw.formulary", formulary), [formulary]);

  const mapIssues = useMemo(() => validateMap(map), [map]);
  const formIssues = useMemo(() => (formulary ? validateFormulary(formulary) : []), [formulary]);
  const rendered = useMemo(() => { try { return renderMapSvg(map, { direction: dir }); } catch (e) { return { svg: `<p>Errore: ${String(e)}</p>`, width: 0, height: 0 }; } }, [map, dir]);
  const formHtml = useMemo(() => (formulary ? renderFormularyHtml(formulary) : ""), [formulary]);

  const chat = (vision = false): ChatFn =>
    makeOpenAiChat({ baseUrl: s.baseUrl, apiKey: s.apiKey, model: vision && s.visionModel ? s.visionModel : s.model });
  const needKey = () => { if (!s.apiKey) { setMsg("Inserisci la chiave API nelle impostazioni."); return true; } return false; };
  const fail = (e: unknown) => setMsg("Errore: " + (e as Error).message + " — se è un errore di rete/CORS vedi la nota nelle impostazioni.");

  // ---------- ingresso: PDF e foto
  async function pickPdf(f: File | undefined) {
    setPdf(f ?? null);
    if (!f) return;
    try { const n = await pdfPageCount(f); setPdfPages(n); setRange(`1-${Math.min(n, 20)}`); } catch (e) { fail(e); }
  }

  async function readPages() {
    const pages: PageData[] = [];
    setBusy(true);
    try {
      if (pdf) {
        const nums = parseRange(range, pdfPages);
        if (!nums.length) { setMsg("Intervallo di pagine non valido."); return; }
        setMsg("Lettura del PDF…");
        pages.push(...(await readPdf(pdf, nums, (p, t) => setMsg(`Lettura pagina ${p}/${t}…`))));
      }
      for (const f of photos.current) pages.push(await readImage(f));
      if (!pages.length) { setMsg("Scegli un PDF o delle foto."); return; }
      const withText = pages.filter((p) => p.text);
      const withImg = pages.filter((p) => p.image);
      let out = withText.map((p) => p.text).join("\n\n");
      if (withImg.length) {
        if (needKey()) return;
        const vc = chat(true);
        let txt = "";
        for (let i = 0; i < withImg.length; i += 3) {
          setMsg(`Trascrizione immagini ${Math.min(i + 3, withImg.length)}/${withImg.length}…`);
          const r = await transcribePages(vc, withImg.slice(i, i + 3).map((p) => p.image!));
          txt += (txt ? "\n\n" : "") + r.text;
        }
        out = out ? out + "\n\n" + txt : txt;
      }
      setMaterial((m) => (m ? m + "\n\n" : "") + out);
      setMsg(`Letto: ${withText.length} pagine con testo, ${withImg.length} da immagine. Controlla il testo qui sotto prima di generare.`);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  // ---------- generazione
  async function findConcepts() {
    if (needKey()) return;
    setBusy(true); setMsg("Cerco i concetti principali…");
    try {
      const r = await makeOutline(chat(), material);
      setOutline((r.value?.concepts ?? []).map((c) => ({ ...c, on: true })));
      setMsg(r.ok ? "Scegli i concetti e genera le mappe." : "Elenco non riuscito, riprova.");
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function genMaps(list: string[]) {
    if (needKey()) return;
    setBusy(true);
    const made: ConceptMap[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        setMsg(`Mappa ${i + 1}/${list.length}: ${list[i]}…`);
        const r = await generateMap(chat(), { concept: list[i], material });
        if (r.value) made.push(r.value);
      }
      if (made.length) {
        const keep = maps.length === 1 && maps[0] === EMPTY_MAP ? [] : maps;
        setMaps([...keep, ...made]);
        setSel(keep.length);
      }
      setMsg(`Fatte ${made.length}/${list.length} mappe. Controlla i punti segnalati.`);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function genFormulary() {
    if (needKey()) return;
    setBusy(true); setMsg("Genero il formulario…");
    try {
      const r = await generateFormulary(chat(), { topic: concept || "argomento del capitolo", material, withExamples });
      if (r.value) { setFormulary(r.value); setFormJson(JSON.stringify(r.value, null, 1)); setFormErr(""); }
      setMsg(r.ok ? `Fatto in ${r.attempts} tentativo/i.` : "Generato, ma restano errori: correggi a mano.");
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  function editFormJson(t: string) {
    setFormJson(t);
    try {
      const p = Formulary.safeParse(JSON.parse(t));
      if (p.success) { setFormulary(p.data); setFormErr(""); } else setFormErr(p.error.issues[0]?.path.join(".") + ": " + p.error.issues[0]?.message);
    } catch (e) { setFormErr("JSON non valido: " + (e as Error).message); }
  }

  // ---------- modifica mappa
  const upNode = (i: number, p: Partial<MapNode>) => setMap({ ...map, nodes: map.nodes.map((n, k) => (k === i ? { ...n, ...p } : n)) });
  const upLink = (i: number, p: Partial<ConceptMap["links"][number]>) => setMap({ ...map, links: map.links.map((l, k) => (k === i ? { ...l, ...p } : l)) });
  const nextId = () => { let i = map.nodes.length + 1; while (map.nodes.some((n) => n.id === "N" + i)) i++; return "N" + i; };

  function importJson(f: File | undefined) {
    if (!f) return;
    f.text().then((t) => {
      const j = JSON.parse(t);
      if (j.schema === "formulary/1") {
        const p = Formulary.safeParse(j);
        if (p.success) { setFormulary(p.data); setFormJson(JSON.stringify(p.data, null, 1)); setMode("formulary"); setMsg("Formulario importato."); } else setMsg("File non valido: " + p.error.issues[0]?.message);
        return;
      }
      const p = ConceptMap.safeParse(j);
      if (p.success) { setMaps([...maps, p.data]); setSel(maps.length); setMode("map"); setMsg("Mappa importata."); } else setMsg("File non valido: " + p.error.issues[0]?.message);
    }).catch((e) => setMsg("Errore: " + e.message));
  }

  const issues = mode === "map" ? mapIssues : formIssues;

  return (
    <>
      <style>{NOTEBOOK_CSS}</style>
      <header>
        <h1>🗺️ ConceptualMap in Work</h1>
        <button className={mode === "map" ? "" : "sec"} onClick={() => setMode("map")}>Mappe</button>
        <button className={mode === "formulary" ? "" : "sec"} onClick={() => setMode("formulary")}>Formulario</button>
        {mode === "map" ? (
          <>
            <button className="sec" onClick={() => download(`${map.title}.json`, JSON.stringify(map, null, 1), "application/json")}>Esporta JSON</button>
            <button className="sec" onClick={() => download(`${map.title}.svg`, rendered.svg, "image/svg+xml")}>Esporta SVG</button>
          </>
        ) : (
          formulary && <button className="sec" onClick={() => download(`${formulary.title}.json`, JSON.stringify(formulary, null, 1), "application/json")}>Esporta JSON</button>
        )}
        <button className="sec" onClick={() => window.print()}>Stampa / PDF</button>
      </header>
      <main>
        <div className="left">
          <section>
            <h2>Impostazioni API</h2>
            <label>Provider</label>
            <select value={s.preset} onChange={(e) => { const p = e.target.value as keyof typeof PRESETS; setS({ ...s, preset: p, baseUrl: PRESETS[p].baseUrl }); }}>
              {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
            </select>
            <label>Base URL</label><input value={s.baseUrl} onChange={(e) => setS({ ...s, baseUrl: e.target.value })} />
            <label>Chiave API</label><input type="password" value={s.apiKey} onChange={(e) => setS({ ...s, apiKey: e.target.value })} />
            <label>Modello</label><input value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} />
            <label>Modello per immagini (vuoto = stesso)</label><input value={s.visionModel} onChange={(e) => setS({ ...s, visionModel: e.target.value })} />
            <p className="small">La chiave resta solo in questo browser. Alcuni provider bloccano le chiamate dal browser (CORS): OpenRouter funziona.</p>
          </section>

          <section>
            <h2>1 · Carica capitolo</h2>
            <label>PDF</label>
            <input type="file" accept="application/pdf" onChange={(e) => pickPdf(e.target.files?.[0])} />
            {pdf && <><label>Pagine ({pdfPages} in totale)</label><input value={range} onChange={(e) => setRange(e.target.value)} placeholder="es. 3-12, 15" /></>}
            <label>Foto delle pagine (anche più di una)</label>
            <input type="file" accept="image/*" multiple onChange={(e) => { photos.current = [...(e.target.files ?? [])]; }} />
            <div className="row"><button disabled={busy} onClick={readPages}>Leggi pagine</button></div>
            <p className="small">I PDF con testo si leggono gratis; scansioni e foto usano il modello per immagini (a pagamento). Togli tu esercizi e mappe già compilate dal testo qui sotto.</p>
            <label>Testo del capitolo (modificabile)</label>
            <textarea value={material} onChange={(e) => setMaterial(e.target.value)} />
          </section>

          <section>
            <h2>2 · Genera</h2>
            <label>{mode === "map" ? "Concetto (per una mappa sola)" : "Argomento del formulario"}</label>
            <input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="es. Il legame covalente" />
            {mode === "map" ? (
              <>
                <div className="row">
                  <button disabled={busy || !material} onClick={() => genMaps([concept || "concetto principale"])}>Una mappa</button>
                  <button disabled={busy || !material} className="sec" onClick={findConcepts}>Trova i concetti</button>
                </div>
                {outline.length > 0 && (
                  <div>
                    {outline.map((c, i) => (
                      <label key={i} style={{ display: "flex", gap: 6 }}>
                        <input type="checkbox" style={{ width: "auto" }} checked={c.on} onChange={(e) => setOutline(outline.map((o, k) => (k === i ? { ...o, on: e.target.checked } : o)))} />
                        <span><b>{c.title}</b><br /><span className="small">{c.summary}</span></span>
                      </label>
                    ))}
                    <div className="row"><button disabled={busy} onClick={() => genMaps(outline.filter((o) => o.on).map((o) => o.title))}>Genera mappe selezionate</button></div>
                  </div>
                )}
              </>
            ) : (
              <>
                <label style={{ display: "flex", gap: 6 }}><input type="checkbox" style={{ width: "auto" }} checked={withExamples} onChange={(e) => setWithExamples(e.target.checked)} />Aggiungi un esempio a ogni scheda</label>
                <div className="row"><button disabled={busy || !material} onClick={genFormulary}>Genera formulario</button></div>
              </>
            )}
            <p className="small">{msg}</p>
          </section>

          <section>
            <h2>Controlli</h2>
            {issues.length === 0 && <p className="ok">✔ Nessun problema.</p>}
            {issues.map((i, k) => <div key={k} className={i.level === "error" ? "issue-error" : "issue-warn"}>{i.level === "error" ? "✖" : "⚠"} {i.where}: {i.message}</div>)}
            {hasErrors(issues) && <p className="small">Gli errori vanno corretti prima di usare il materiale per lo studio.</p>}
          </section>
          <section>
            <h2>Importa JSON</h2>
            <input type="file" accept="application/json" onChange={(e) => importJson(e.target.files?.[0])} />
          </section>
        </div>

        <div>
          {mode === "map" ? (
            <>
              <section className="noprint">
                <h2>Mappe ({maps.length})</h2>
                <div className="row">
                  <select value={sel} onChange={(e) => setSel(Number(e.target.value))}>{maps.map((m, i) => <option key={i} value={i}>{i + 1}. {m.title}</option>)}</select>
                  <select value={dir} onChange={(e) => setDir(e.target.value as "TB" | "LR")}><option value="TB">Verticale</option><option value="LR">Orizzontale</option></select>
                  <button className="sec" onClick={() => { setMaps(maps.length > 1 ? maps.filter((_, i) => i !== sel) : [EMPTY_MAP]); setSel(0); }}>Elimina</button>
                </div>
              </section>
              <div className="preview" dangerouslySetInnerHTML={{ __html: rendered.svg }} />
              <section className="noprint" style={{ marginTop: 12 }}>
                <h2>Modifica titolo e nodi</h2>
                <input value={map.title} onChange={(e) => setMap({ ...map, title: e.target.value })} />
                <table className="edit-table"><tbody>
                  {map.nodes.map((n, i) => (
                    <tr key={n.id}>
                      <td style={{ width: 50 }}>{n.id}</td>
                      <td style={{ width: 90 }}><select value={n.cls} onChange={(e) => upNode(i, { cls: e.target.value as MapNode["cls"] })}>{["center", "l1", "l2", "l3", "extra"].map((c) => <option key={c}>{c}</option>)}</select></td>
                      <td style={{ width: 50 }}><input value={n.emoji ?? ""} onChange={(e) => upNode(i, { emoji: e.target.value || undefined })} /></td>
                      <td><input value={n.text.replace(/\n/g, " / ")} onChange={(e) => upNode(i, { text: e.target.value.replace(/ \/ /g, "\n") })} /></td>
                      <td><button className="sec" onClick={() => setMap({ ...map, nodes: map.nodes.filter((_, k) => k !== i), links: map.links.filter((l) => l.from !== n.id && l.to !== n.id) })}>✕</button></td>
                    </tr>
                  ))}
                </tbody></table>
                <div className="row"><button className="sec" onClick={() => setMap({ ...map, nodes: [...map.nodes, { id: nextId(), cls: "l2", text: "Nuovo nodo" }] })}>+ Nodo</button></div>
                <h2 style={{ marginTop: 14 }}>Modifica collegamenti</h2>
                <table className="edit-table"><tbody>
                  {map.links.map((l, i) => (
                    <tr key={i}>
                      <td><select value={l.from} onChange={(e) => upLink(i, { from: e.target.value })}>{map.nodes.map((n) => <option key={n.id}>{n.id}</option>)}</select></td>
                      <td><select value={l.to} onChange={(e) => upLink(i, { to: e.target.value })}>{map.nodes.map((n) => <option key={n.id}>{n.id}</option>)}</select></td>
                      <td><input value={l.label} onChange={(e) => upLink(i, { label: e.target.value })} /></td>
                      <td style={{ width: 90 }}><select value={l.kind} onChange={(e) => upLink(i, { kind: e.target.value as "tree" | "cross" })}><option>tree</option><option>cross</option></select></td>
                      <td><button className="sec" onClick={() => setMap({ ...map, links: map.links.filter((_, k) => k !== i) })}>✕</button></td>
                    </tr>
                  ))}
                </tbody></table>
                <div className="row"><button className="sec" onClick={() => setMap({ ...map, links: [...map.links, { from: map.nodes[0]?.id ?? "", to: map.nodes[1]?.id ?? "", label: "collega", kind: "tree" }] })}>+ Collegamento</button></div>
              </section>
            </>
          ) : (
            <>
              {formulary ? (
                <div className="formwrap" dangerouslySetInnerHTML={{ __html: formHtml }} />
              ) : (
                <section><p>Nessun formulario ancora. Carica un capitolo, scrivi l'argomento e premi «Genera formulario», oppure importa un JSON (esempio nel repository: <code>examples/formulario-scomposizioni.json</code>).</p></section>
              )}
              <section className="noprint" style={{ marginTop: 12 }}>
                <h2>Modifica (JSON)</h2>
                <textarea style={{ minHeight: 260, fontFamily: "monospace", fontSize: 12 }} value={formJson} onChange={(e) => editFormJson(e.target.value)} />
                {formErr && <p className="issue-error">{formErr}</p>}
                <p className="small">Le modifiche valide aggiornano subito l'anteprima. Evidenziatore: ==testo==. Formule nei testi: $...$.</p>
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}
