/**
 * `spx diagnose` handler — resolves the diagnostic facts, runs the resolved
 * check set through the injected registry, folds the report, and renders it with
 * the exit code keyed to the overall verdict. With a manifest path the manifest
 * is read through the injected filesystem and is authoritative for caller facts;
 * product-owned harness facts always resolve from the addressed product.
 * Owns the command-layer filesystem orchestration — manifest read and config
 * resolution — with no Commander binding and no process exit.
 *
 * @module commands/diagnose
 */

import { resolveConfig } from "@/config/index";
import type { MethodologyConfig } from "@/config/methodology";
import { isLegacyHarnessMethodologyConfigError, resolveMethodologyConfig } from "@/config/methodology-placement";
import type { Result } from "@/config/types";
import {
  DEFAULT_HARNESS_ENVIRONMENT_CONFIG,
  type HarnessEnvironmentConfig,
  harnessEnvironmentConfigDescriptor,
} from "@/domains/agent-environment/config";
import { type DiagnoseConfig, diagnoseConfigDescriptor } from "@/domains/diagnose/config";
import { type CheckRegistry, runDiagnose } from "@/domains/diagnose/engine";
import { overallExitCode } from "@/domains/diagnose/fold";
import { CHECK_NAME, type CheckName, type DiagnoseManifest, parseManifest } from "@/domains/diagnose/manifest";
import { type DiagnoseOutputMode, renderReport } from "@/domains/diagnose/report";
import { resolveDiagnoseCheckSet, resolveDiagnoseFacts } from "@/domains/diagnose/resolve";
import type { DiagnoseReport } from "@/domains/diagnose/types";
import { SPX_VERSION } from "@/version";

/** The injected boundary the handler reads the manifest file through. */
export interface ManifestFileSystem {
  readFile(path: string): Promise<string>;
}

export interface DiagnoseCommandOptions {
  /** Path to the declarative diagnose manifest; when omitted, facts resolve from config and safe defaults. */
  readonly manifestPath?: string;
  /** The product directory the `spx.config` diagnose section is resolved from. */
  readonly productDir: string;
  /** Presentation mode for the rendered report. */
  readonly outputMode: DiagnoseOutputMode;
  /** Whether the text report carries ANSI styling, resolved at the descriptor boundary. */
  readonly color: boolean;
  /** The check runners the engine dispatches the resolved check set to. */
  readonly registry: CheckRegistry;
  /** Injected manifest filesystem. */
  readonly fs: ManifestFileSystem;
}

/** Resolves the `spx.config` diagnose section from the product directory. */
async function resolveDiagnoseConfig(productDir: string): Promise<
  Result<DiagnoseConfig>
> {
  const loaded = await resolveConfig(productDir, [diagnoseConfigDescriptor]);
  if (!loaded.ok) return loaded;
  return { ok: true, value: loaded.value[diagnoseConfigDescriptor.section] as DiagnoseConfig };
}

async function resolveHarnessEnvironmentConfig(productDir: string): Promise<Result<HarnessEnvironmentConfig>> {
  const loaded = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);
  if (!loaded.ok) return loaded;
  return {
    ok: true,
    value: loaded.value[harnessEnvironmentConfigDescriptor.section] as HarnessEnvironmentConfig,
  };
}

export interface DiagnoseCommandResult {
  /** The complete folded report supplied to the selected presentation mode. */
  readonly report: DiagnoseReport;
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

function shouldResolveMethodologyConfig(manifest: DiagnoseManifest | undefined, checks: readonly CheckName[]): boolean {
  if (manifest !== undefined) {
    return false;
  }
  return checks.includes(CHECK_NAME.METHODOLOGY_CONTEXT);
}

function shouldResolveHarnessEnvironment(checks: readonly CheckName[]): boolean {
  return checks.includes(CHECK_NAME.PLUGIN_BOOTSTRAP) || checks.includes(CHECK_NAME.MARKETPLACE_INSTALL);
}

interface ResolvedMethodologyFacts {
  readonly methodology?: MethodologyConfig;
  readonly methodologyError?: string;
}

async function resolveMethodologyFacts(
  productDir: string,
  shouldResolve: boolean,
): Promise<Result<ResolvedMethodologyFacts>> {
  if (!shouldResolve) return { ok: true, value: {} };
  const methodologyConfig = await resolveMethodologyConfig(productDir);
  if (methodologyConfig.ok) {
    return { ok: true, value: { methodology: methodologyConfig.value } };
  }
  if (isLegacyHarnessMethodologyConfigError(methodologyConfig.error)) return methodologyConfig;
  return { ok: true, value: { methodologyError: methodologyConfig.error } };
}

/** Resolves the facts, runs the resolved check set, and returns the rendered report and verdict-keyed exit code. */
export async function diagnoseCommand(options: DiagnoseCommandOptions): Promise<Result<DiagnoseCommandResult>> {
  const availableChecks = Object.keys(options.registry) as CheckName[];

  const manifest = options.manifestPath === undefined
    ? undefined
    : await readManifest(options.fs, options.manifestPath, availableChecks);
  if (manifest !== undefined && !manifest.ok) return manifest;

  // A supplied manifest takes precedence for caller facts. On the config path,
  // diagnose.checks resolves before methodology config is read so unrelated
  // methodology config defects do not derail checks that do not consume it.
  const config: Result<DiagnoseConfig | undefined> = manifest === undefined
    ? await resolveDiagnoseConfig(options.productDir)
    : { ok: true, value: undefined };
  if (!config.ok) return config;
  const resolvedChecks = resolveDiagnoseCheckSet(config.value ?? {}, availableChecks);
  if (!resolvedChecks.ok) return resolvedChecks;
  const effectiveChecks = manifest?.value.checks ?? resolvedChecks.value;

  const harnessEnvironment = shouldResolveHarnessEnvironment(effectiveChecks)
    ? await resolveHarnessEnvironmentConfig(options.productDir)
    : { ok: true as const, value: DEFAULT_HARNESS_ENVIRONMENT_CONFIG };
  if (!harnessEnvironment.ok) return harnessEnvironment;

  const methodology = await resolveMethodologyFacts(
    options.productDir,
    shouldResolveMethodologyConfig(manifest?.value, resolvedChecks.value),
  );
  if (!methodology.ok) return methodology;

  const resolved = resolveDiagnoseFacts({
    manifest: manifest?.value,
    config: config.value ?? {},
    methodology: methodology.value.methodology,
    methodologyError: methodology.value.methodologyError,
    harnessEnvironment: harnessEnvironment.value,
    availableChecks,
  });
  if (!resolved.ok) return resolved;

  const report = await runDiagnose(resolved.value, options.registry);
  if (!report.ok) return report;

  return {
    ok: true,
    value: {
      report: report.value,
      output: renderReport(report.value, options.outputMode, { color: options.color, executingVersion: SPX_VERSION }),
      exitCode: overallExitCode(report.value.overall),
    },
  };
}
