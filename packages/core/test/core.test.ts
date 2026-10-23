import { describe, expect, it } from "vitest";
import { ConceptMap, extractJson, generateMap, hasErrors, renderMapSvg, validateMap, type ChatFn } from "../src";
import { goodMap } from "./fixture";

describe("rules", () => {
  it("accetta una mappa valida", () => {
    expect(ConceptMap.safeParse(goodMap).success).toBe(true);
    expect(hasErrors(validateMap(goodMap))).toBe(false);
  });
  it("segnala nodo troppo lungo, emoji mancante e due centri", () => {
    const bad = structuredClone(goodMap);
    bad.nodes[1].text = "una frase molto lunga che supera di certo il limite di parole";
    bad.nodes[2].emoji = undefined;
    bad.nodes[3].cls = "center";
    const codes = validateMap(bad).map((i) => i.code);
    expect(codes.length).toBeGreaterThan(2);
    expect(hasErrors(validateMap(bad))).toBe(true);
  });
  it("segnala nodo senza collegamento in ingresso", () => {
    const bad = structuredClone(goodMap);
    bad.links = bad.links.filter((l) => l.to !== "B4");
    expect(hasErrors(validateMap(bad))).toBe(true);
  });
});

describe("extractJson", () => {
  it("gestisce blocchi markdown e testo attorno", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('ecco: {"a":2} fine')).toEqual({ a: 2 });
  });
});

describe("render", () => {
  it("produce un SVG con tutti i nodi e gli stili", () => {
    const { svg, width, height } = renderMapSvg(goodMap);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("#1E3A8A");
    expect(svg).toContain("Legame covalente");
    expect(svg).toContain("stroke-dasharray");
    expect(width).toBeGreaterThan(200);
    expect(height).toBeGreaterThan(200);
  });
});

describe("pipeline", () => {
  it("riprova con gli errori e poi riesce", async () => {
    const bad = structuredClone(goodMap);
    bad.nodes[2].emoji = undefined;
    const answers = [JSON.stringify(bad), JSON.stringify(goodMap)];
    const seen: number[] = [];
    const chat: ChatFn = async (msgs) => {
      seen.push(msgs.length);
      return { text: answers.shift()! };
    };
    const r = await generateMap(chat, { concept: "x", material: "y" });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(2);
    expect(r.firstTryClean).toBe(false);
    expect(seen).toEqual([2, 4]);
  });
});
