import { dirname, resolve } from "node:path";

import ts from "typescript";
import { expect } from "vitest";

const TYPESCRIPT_CONFIG_NAME = "tsconfig.json";
const PUBLIC_SURFACE_CONSUMER_FIXTURE = "testing/fixtures/spec-tree/public-surface-consumer.ts";

const DIAGNOSTIC_HOST: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => process.cwd(),
  getNewLine: () => "\n",
};

export function assertPublicSpecTreeSurfaceExportsDeclaredContracts(): void {
  const configPath = resolve(process.cwd(), TYPESCRIPT_CONFIG_NAME);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  expect(config.error, formatDiagnostic(config.error)).toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath), {}, configPath);
  const program = ts.createProgram({
    rootNames: [resolve(process.cwd(), PUBLIC_SURFACE_CONSUMER_FIXTURE)],
    options: parsed.options,
  });
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
  expect(diagnostics, ts.formatDiagnosticsWithColorAndContext(diagnostics, DIAGNOSTIC_HOST)).toEqual([]);
}

function formatDiagnostic(diagnostic: ts.Diagnostic | undefined): string {
  return diagnostic === undefined ? "" : ts.formatDiagnostic(diagnostic, DIAGNOSTIC_HOST);
}
