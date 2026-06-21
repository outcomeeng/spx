/**
 * `spx diagnose` handler — reads the declarative manifest, runs the manifest's
 * checks through the injected registry, folds the report, and renders it with
 * the exit code keyed to the overall verdict. Composes the pure domain pipeline
 * with the injected manifest filesystem; carries no Commander binding and no
 * process exit.
 *
 * @module commands/diagnose
 */

import type { Result } from "@/config/types";
import { type CheckRegistry, runDiagnose } from "@/domains/diagnose/engine";
import { overallExitCode } from "@/domains/diagnose/fold";
import { type CheckName, parseManifest } from "@/domains/diagnose/manifest";
import { type DiagnoseFormat, renderReport } from "@/domains/diagnose/report";

/** The injected boundary the handler reads the manifest file through. */
export interface ManifestFileSystem {
  readFile(path: string): Promise<string>;
}

export interface DiagnoseCommandOptions {
  /** Path to the declarative diagnose manifest. */
  readonly manifestPath: string;
  /** Output format for the rendered report. */
  readonly format: DiagnoseFormat;
  /** The check runners the engine dispatches the manifest's checks to. */
  readonly registry: CheckRegistry;
  /** Injected manifest filesystem. */
  readonly fs: ManifestFileSystem;
}

export interface DiagnoseCommandResult {
  /** The rendered report in the requested format. */
  readonly output: string;
  /** The exit code keyed to the overall verdict. */
  readonly exitCode: number;
}

/** Reads and runs the manifest, returning the rendered report and the verdict-keyed exit code. */
export async function diagnoseCommand(options: DiagnoseCommandOptions): Promise<Result<DiagnoseCommandResult>> {
  let raw: string;
  try {
    raw = await options.fs.readFile(options.manifestPath);
  } catch (error) {
    return {
      ok: false,
      error: `cannot read diagnose manifest at ${options.manifestPath}: ${(error as Error).message}`,
    };
  }

  const availableChecks = Object.keys(options.registry) as CheckName[];
  const manifest = parseManifest(raw, availableChecks);
  if (!manifest.ok) return manifest;

  const report = await runDiagnose(manifest.value, options.registry);
  if (!report.ok) return report;

  return {
    ok: true,
    value: { output: renderReport(report.value, options.format), exitCode: overallExitCode(report.value.overall) },
  };
}
