import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConceptMap, hasErrors, renderMapSvg, validateMap } from "../src";

const dir = join(__dirname, "../../../examples/maps");
describe("mappe di esempio", () => {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    it(f, () => {
      const m = ConceptMap.parse(JSON.parse(readFileSync(join(dir, f), "utf8")));
      const issues = validateMap(m).filter((i) => i.level === "error");
      expect(issues, JSON.stringify(issues)).toEqual([]);
      expect(renderMapSvg(m).svg.length).toBeGreaterThan(500);
    });
  }
});
