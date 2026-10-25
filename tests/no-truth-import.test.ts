// tests/no-truth-import.test.ts
// Guard for R8: engine/ never imports sim/ (where GroundTruth lives).
// Scans every .ts file under engine/ (recursively) for static, dynamic and require imports.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("engine isolation", () => {
  it("no engine file imports from sim/", () => {
    const files = tsFiles(join(__dirname, "..", "engine"));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/from\s+["'][^"']*\bsim(\/|["'])/);
      expect(src, file).not.toMatch(/import\(\s*["'][^"']*\bsim(\/|["'])/);
      expect(src, file).not.toMatch(/require\(\s*["'][^"']*\bsim(\/|["'])/);
    }
  });
});
