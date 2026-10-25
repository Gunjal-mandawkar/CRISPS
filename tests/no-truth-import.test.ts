// tests/no-truth-import.test.ts
// Guard for R8: no file under /engine may import from /sim (where GroundTruth lives).

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("engine isolation", () => {
  it("no engine file imports from sim/", () => {
    const dir = join(__dirname, "..", "engine");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const src = readFileSync(join(dir, file), "utf8");
      expect(src, file).not.toMatch(/from\s+["'][^"']*sim\//);
    }
  });
});
