#!/usr/bin/env python3
"""Converte maps_data.py (formato storico dei PDF) in examples/maps/NN-slug.json (schema concept-map/1).
Uso: python3 scripts/export_examples.py /percorso/maps_data.py"""
import json, re, sys, unicodedata, importlib.util, pathlib

src = sys.argv[1]
spec = importlib.util.spec_from_file_location("maps_data", src)
md = importlib.util.module_from_spec(spec); spec.loader.exec_module(md)

EMO = dict(prova="🧪", petri="🧫", rotolo="📜", atomo="⚛️", link="🔗", freccia="➡️", doppia="↔️",
  triangolo="🔺", rombo="🔶", meno="➖", mattoni="🧱", righello="📏", spirale="🌀", pagina="📄",
  ghiaccio="🧊", pompa="⛽", puzzle="🧩", dna="🧬", globo="🌐", bilancia="⚖️", goccia="💧",
  mano="🤝", bersaglio="🎯", forbici="✂️", piu="➕", cicli="🔄", mix="🔀", alambicco="⚗️",
  batteria="🔋", fuoco="🔥", ok="✅", attenzione="⚠️", etichetta="🏷️", squadra="📐", fulmine="⚡")
CLS = {"centro": "center", "liv1": "l1", "liv2": "l2", "liv3": "l3", "extra": "extra"}

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

out = pathlib.Path(__file__).resolve().parent.parent / "examples" / "maps"
out.mkdir(parents=True, exist_ok=True)
for i, m in enumerate(md.MAPS, 1):
    nodes = []
    for nid, (cls, emo, text) in m["nodes"].items():
        n = {"id": nid, "cls": CLS[cls], "text": text.replace("//", "\n")}
        if emo: n["emoji"] = EMO[emo]
        nodes.append(n)
    links = [{"from": a, "to": b, "label": l, "kind": "cross" if k == "x" else "tree"} for a, b, l, k in m["edges"]]
    doc = {"schema": "concept-map/1", "title": m["titolo"], "subject": "Chimica organica",
           "source": {"book": "Le basi della chimica organica (cap. 1)", "pages": m["fonte"]},
           "nodes": nodes, "links": links}
    (out / f"{i:02d}-{slug(m['titolo'])}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf8")
print(f"{len(md.MAPS)} mappe esportate in {out}")
