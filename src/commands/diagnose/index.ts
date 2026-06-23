/**
 * `spx diagnose` handler — resolves the diagnostic facts, runs the resolved
 * check set through the injected registry, folds the report, and renders it with
 * the exit code keyed to the overall verdict. With a manifest path the manifest
 * is read through the injected filesystem and is authoritative; otherwise the
 * facts resolve from the `spx.config` diagnose section read at the product
 * directory and per-check safe defaults, per `spx/54-diagnose.enabler/11-invocation-modes.pdr.md`.
 * Owns the command-layer filesystem orchestration — manifest read and config
 * resolution — with no Commander binding and no process exit.
 *
 * @module commands/diagnose
 */

import { resolveConfig } from "@/config/index";
import type { Result } from "@/config/types";
import { type DiagnoseConfig, diagnoseConfigDescriptor } from "@/domains/diagnose/config";
import { type CheckRegistry, runDiagnose } from "@/domains/diagnose/engine";
import { overallExitCode } from "@/domains/diagnose/fold";
import { type CheckName, type DiagnoseManifest, parseManifest } from "@/domains/diagnose/manifest";
import { type DiagnoseFormat, renderReport } from "@/domains/diagnose/report";
import { resolveDiagnoseFacts } from "@/domains/diagnose/resolve";

/** The injected boundary the handler reads the manifest file through. */
export interface ManifestFileSystem {
  readFile(path: string): Promise<string>;
}

export interface DiagnoseCommandOptions {
  /** Path to the declarative diagnose manifest; when omitted, facts resolve from config and safe defaults. */
  readonly manifestPath?: string;
  /** The product directory the `spx.config` diagnose section is resolved from. */
  readonly productDir: string;
  /** Output format for the rendered report. */
  readonly format: DiagnoseFormat;
  /** Whether the text report carries ANSI styling, resolved at the descriptor boundary. */
  readonly color: boolean;
  /** The check runners the engine dispatches the resolved check set to. */
  readonly registry: CheckRegistry;
  /** Injected manifest filesystem. */
  readonly fs: ManifestFileSystem;
}

/** Resolves the `spx.config` diagnose section from the product directory. */
async function resolveDiagnoseConfig(productDir: string): Promise<Result<DiagnoseConfig>> {
  const loaded = await resolveConfig(productDir, [diagnoseConfigDescriptor]);
  if (!loaded.ok) return loaded;
  return { ok: true, value: loaded.value[diagnoseConfigDescriptor.section] as DiagnoseConfig };
}

export interface DiagnoseCommandResult {
  /** The rendered report in the requested format. */
  readonly output: string;
  /** The exit code keyed to the overall verdict. */
  readonly exitCode: number;
}

async function readManifest(
  fs: ManifestFileSystem,
  manifestPath: string,
  availableChecks: readonly CheckName[],
): Promise<Result<DiagnoseManifest>> {
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath);
  } catch (error) {
    return { ok: false, error: `cannot read diagnose manifest at ${manifestPath}: ${(error as Error).message}` };
  }
  return parseManifest(raw, availableChecks);
}

/** Resolves the facts, runs the resolved check set, and returns the rendered report and verdict-keyed exit code. */
export async function diagnoseCommand(options: DiagnoseCommandOptions): Promise<Result<DiagnoseCommandResult>> {
  const availableChecks = Object.keys(options.registry) as CheckName[];

  const manifest = options.manifestPath === undefined
    ? undefined
    : await readManifest(options.fs, options.manifestPath, availableChecks);
  if (manifest !== undefined && !manifest.ok) return manifest;

  // A supplied manifest takes precedence over configuration (the PDR's precedence rule), so config
  // is resolved only on the no-manifest path — a malformed diagnose config never derails a manifest run.
  const config: Result<DiagnoseConfig> = manifest === undefined
    ? await resolveDiagnoseConfig(options.productDir)
    : { ok: true, value: {} };
  if (!config.ok) return config;

  const resolved = resolveDiagnoseFacts({
    manifest: manifest?.value,
    config: config.value,
    availableChecks,
  });
  if (!resolved.ok) return resolved;

  const report = await runDiagnose(resolved.value, options.registry);
  if (!report.ok) return report;

  return {
    ok: true,
    value: {
      output: renderReport(report.value, options.format, { color: options.color }),
      exitCode: overallExitCode(report.value.overall),
    },
  };
}
