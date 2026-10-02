import { realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";

import { execa } from "execa";

const ESLINT_PACKAGE_MANIFEST = "eslint/package.json";
const ESLINT_BIN_RELATIVE_PATH = join("bin", "eslint.js");
const ESLINT_PROBE_CONFIG_FILENAME = "eslint.config.mjs";
const ESLINT_JSON_FORMAT_ARGS = ["--format", "json"] as const;
const ESLINT_WALK_TARGET = ".";
const POSIX_SEPARATOR = "/";

// Files carrying an extension or a dot-prefixed basename are linted in directory mode, so every
// walked fixture file participates unless an ignore argument removes it; no rules run.
const ESLINT_PROBE_CONFIG = `export default [{ files: ["**/*.*", "**/.*"] }];\n`;

const requireFromHarness = createRequire(import.meta.url);

export type EslintInvocationObservation = {
  readonly exitCode: number | undefined;
  readonly stderr: string;
  /** Product-relative paths ESLint reported as linted, or `undefined` when stdout carried no JSON report. */
  readonly lintedPaths: readonly string[] | undefined;
};

type EslintJsonResult = {
  readonly filePath: string;
};

export async function writeEslintProbeConfig(productDir: string): Promise<void> {
  await writeFile(join(productDir, ESLINT_PROBE_CONFIG_FILENAME), ESLINT_PROBE_CONFIG);
}

export async function runEslintOverProduct(
  productDir: string,
  toolArguments: readonly string[],
): Promise<EslintInvocationObservation> {
  const eslintBin = join(dirname(requireFromHarness.resolve(ESLINT_PACKAGE_MANIFEST)), ESLINT_BIN_RELATIVE_PATH);
  const result = await execa(
    process.execPath,
    [eslintBin, ...ESLINT_JSON_FORMAT_ARGS, ...toolArguments, ESLINT_WALK_TARGET],
    { cwd: productDir, reject: false },
  );
  const resolvedProductDir = await realpath(productDir);
  return {
    exitCode: result.exitCode,
    stderr: result.stderr,
    lintedPaths: await lintedProductPaths(result.stdout, resolvedProductDir),
  };
}

async function lintedProductPaths(stdout: string, resolvedProductDir: string): Promise<readonly string[] | undefined> {
  let report: unknown;
  try {
    report = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (!Array.isArray(report)) return undefined;
  const paths: string[] = [];
  for (const entry of report as readonly EslintJsonResult[]) {
    const absolutePath = await realpath(entry.filePath);
    const productPath = relative(resolvedProductDir, absolutePath);
    paths.push(sep === POSIX_SEPARATOR ? productPath : productPath.split(sep).join(POSIX_SEPARATOR));
  }
  return paths;
}
