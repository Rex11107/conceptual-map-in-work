import { useEffect, useMemo, useState } from "react";
import {
  ConceptMap, PRESETS, generateMap, hasErrors, makeOpenAiChat, renderMapSvg, validateMap,
  type MapNode,
} from "@cmiw/core";

type Settings = { preset: keyof typeof PRESETS; baseUrl: string; apiKey: string; model: string };
const DEFAULT_SETTINGS: Settings = { preset: "openrouter", baseUrl: PRESETS.openrouter.baseUrl, apiKey: "", model: "deepseek/deepseek-chat" };

function load<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
}
function save(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage non disponibile */ } }

const EMPTY: ConceptMap = {
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

export function App() {
  const [s, setS] = useState<Settings>(() => load("cmiw.settings", DEFAULT_SETTINGS));
  const [map, setMap] = useState<ConceptMap>(() => load("cmiw.map", EMPTY));
  const [concept, setConcept] = useState("");
  const [material, setMaterial] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [dir, setDir] = useState<"TB" | "LR">("TB");

  useEffect(() => save("cmiw.settings", s), [s]);
  useEffect(() => save("cmiw.map", map), [map]);

  const issues = useMemo(() => validateMap(map), [map]);
  const rendered = useMemo(() => { try { return renderMapSvg(map, { direction: dir }); } catch (e) { return { svg: `<p>Errore: ${String(e)}</p>`, width: 0, height: 0 }; } }, [map, dir]);

  async function run() {
    if (!s.apiKey) return setMsg("Inserisci la chiave API nelle impostazioni.");
    setBusy(true); setMsg("Generazione in corso…");
    try {
      const chat = makeOpenAiChat({ baseUrl: s.baseUrl, apiKey: s.apiKey, model: s.model });
      const r = await generateMap(chat, { concept: concept || "concetto principale", material });
      if (r.value) setMap(r.value);
      setMsg(r.ok ? `Fatto in ${r.attempts} tentativo/i.` : "Generata, ma restano errori: correggi a mano (vedi Controlli).");
    } catch (e) {
      setMsg("Errore: " + (e as Error).message + " — se è un errore di rete/CORS vedi la nota nelle impostazioni.");
    } finally { setBusy(false); }
  }

  const upNode = (i: number, p: Partial<MapNode>) => setMap({ ...map, nodes: map.nodes.map((n, k) => (k === i ? { ...n, ...p } : n)) });
  const upLink = (i: number, p: Partial<ConceptMap["links"][number]>) => setMap({ ...map, links: map.links.map((l, k) => (k === i ? { ...l, ...p } : l)) });
  const nextId = () => { let i = map.nodes.length + 1; while (map.nodes.some((n) => n.id === "N" + i)) i++; return "N" + i; };

  function importJson(f: File | undefined) {
    if (!f) return;
    f.text().then((t) => {
      const p = ConceptMap.safeParse(JSON.parse(t));
      if (p.success) { setMap(p.data); setMsg("Importata."); } else setMsg("File non valido: " + p.error.issues[0]?.message);
    }).catch((e) => setMsg("Errore: " + e.message));
  }

  return (
    <>
      <header>
        <h1>🗺️ ConceptualMap in Work</h1>
        <button className="sec" onClick={() => download(`${map.title}.json`, JSON.stringify(map, null, 1), "application/json")}>Esporta JSON</button>
        <button className="sec" onClick={() => download(`${map.title}.svg`, rendered.svg, "image/svg+xml")}>Esporta SVG</button>
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
            <p className="small">La chiave resta solo in questo browser. Alcuni provider bloccano le chiamate dal browser (CORS): OpenRouter funziona, per gli altri nell'app Android non ci sono problemi.</p>
          </section>
          <section>
            <h2>Genera da testo</h2>
            <label>Concetto</label><input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="es. Il legame covalente" />
            <label>Materiale (testo del capitolo)</label>
            <textarea value={material} onChange={(e) => setMaterial(e.target.value)} />
            <div className="row"><button disabled={busy || !material} onClick={run}>Genera mappa</button></div>
            <p className="small">{msg}</p>
          </section>
          <section>
            <h2>Controlli</h2>
            {issues.length === 0 && <p className="ok">✔ Nessun problema.</p>}
            {issues.map((i, k) => <div key={k} className={i.level === "error" ? "issue-error" : "issue-warn"}>{i.level === "error" ? "✖" : "⚠"} {i.where}: {i.message}</div>)}
            {hasErrors(issues) && <p className="small">Gli errori vanno corretti prima di usare la mappa per lo studio.</p>}
          </section>
          <section>
            <h2>Importa</h2>
            <input type="file" accept="application/json" onChange={(e) => importJson(e.target.files?.[0])} />
          </section>
        </div>
        <div>
          <section className="noprint">
            <h2>Anteprima</h2>
            <div className="row" style={{ maxWidth: 260 }}>
              <select value={dir} onChange={(e) => setDir(e.target.value as "TB" | "LR")}>
                <option value="TB">Verticale</option><option value="LR">Orizzontale</option>
              </select>
            </div>
          </section>
          <div className="preview" dangerouslySetInnerHTML={{ __html: rendered.svg }} />
          <section className="noprint" style={{ marginTop: 12 }}>
            <h2>Modifica nodi</h2>
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
        </div>
      </main>
    </>
  );
}
