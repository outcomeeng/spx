import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "..", "..", "..");
const sourceRoot = resolve(repoRoot, "src");
const lifecycleHome = "lib" + sep + "process-lifecycle" + sep;
const validationStepsHome = "validation" + sep + "steps" + sep;
const lifecycleRunnerSymbol = "lifecycleProcessRunner";

const asyncSpawnImportPattern = /\bimport\s*\{[^}]*\bspawn\b[^}]*\}\s*from\s*["'](?:node:)?child_process["']/;
const asyncSpawnRequirePattern = /\brequire\s*\(\s*["'](?:node:)?child_process["']\s*\)\s*\.\s*spawn\b/;

async function* walkTypeScriptSources(dir: string): AsyncGenerator<string, void, void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "tests") continue;
      yield* walkTypeScriptSources(full);
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      yield full;
    }
  }
}

async function readSourceFiles(
  predicate: (relPath: string) => boolean,
): Promise<readonly { path: string; content: string }[]> {
  const files: { path: string; content: string }[] = [];
  for await (const absolute of walkTypeScriptSources(sourceRoot)) {
    const relPath = relative(sourceRoot, absolute);
    if (!predicate(relPath)) continue;
    const content = await readFile(absolute, "utf8");
    files.push({ path: relPath, content });
  }
  return files;
}

describe("Compliance: async child_process.spawn import locations", () => {
  it("only modules under src/lib/process-lifecycle/ import child_process.spawn for async use", async () => {
    const sources = await readSourceFiles((path) => !path.startsWith(lifecycleHome));

    const violations = sources.filter(
      (file) => asyncSpawnImportPattern.test(file.content) || asyncSpawnRequirePattern.test(file.content),
    );

    expect(violations.map((v) => v.path)).toEqual([]);
  });
});

describe("Compliance: validation step ProcessRunner defaults reference lifecycleProcessRunner", () => {
  it("every default ProcessRunner export under src/validation/steps/ references lifecycleProcessRunner", async () => {
    const sources = await readSourceFiles((path) => path.startsWith(validationStepsHome) && !path.endsWith(".test.ts"));

    expect(sources.length).toBeGreaterThan(0);

    const stepsDeclaringDefaultRunner = sources.filter((file) =>
      /export\s+const\s+default\w*ProcessRunner\b/.test(file.content)
    );

    expect(stepsDeclaringDefaultRunner.length).toBeGreaterThan(0);

    const violations = stepsDeclaringDefaultRunner.filter((file) => !file.content.includes(lifecycleRunnerSymbol));
    expect(violations.map((v) => v.path)).toEqual([]);
  });
});
