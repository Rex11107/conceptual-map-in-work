import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PageData = { label: string; text: string; image?: string }; // image = data URL, solo se la pagina non ha testo

/** "1-5, 8" → [1,2,3,4,5,8] (limitato a max pagine). */
export function parseRange(spec: string, max: number): number[] {
  const out = new Set<number>();
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.max(1, a); i <= Math.min(max, b); i++) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

export async function pdfPageCount(file: File): Promise<number> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  return doc.numPages;
}

/** Per ogni pagina: testo se il PDF ha il livello di testo, altrimenti un'immagine da trascrivere con visione. */
export async function readPdf(file: File, pages: number[], onProgress?: (p: number, tot: number) => void): Promise<PageData[]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: PageData[] = [];
  let k = 0;
  for (const n of pages) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const text = tc.items.map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : " ") : "")).join("").replace(/[ \t]+/g, " ").trim();
    if (text.length >= 120) {
      out.push({ label: `${file.name} p.${n}`, text });
    } else {
      const vp = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp, canvas }).promise;
      out.push({ label: `${file.name} p.${n}`, text: "", image: canvas.toDataURL("image/jpeg", 0.82) });
    }
    onProgress?.(++k, pages.length);
  }
  return out;
}

/** Foto: ridimensionata a max 1600px per contenere il costo. */
export async function readImage(file: File): Promise<PageData> {
  const bmp = await createImageBitmap(file);
  const r = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * r);
  canvas.height = Math.round(bmp.height * r);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return { label: file.name, text: "", image: canvas.toDataURL("image/jpeg", 0.85) };
}
