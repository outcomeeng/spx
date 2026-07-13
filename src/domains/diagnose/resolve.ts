/**
 * Diagnose fact resolution — produces the typed manifest the engine judges
 * against from the precedence `--manifest` over the `spx.config` diagnose
 * section over per-check safe defaults. An explicit manifest is
 * returned unchanged, preserving its completeness contract; otherwise the
 * configuration facts and the default check set compose into a manifest whose
 * absent facts each check degrades against. Pure; no I/O.
 *
 * @module domains/diagnose/resolve
 */

import type { MethodologyConfig } from "@/config/methodology";
import type { Result } from "@/config/types";
import type { DiagnoseConfig } from "@/domains/diagnose/config";
import { CHECK_NAME, type CheckName, type DiagnoseManifest } from "@/domains/diagnose/manifest";

const CHECK_NAMES = new Set<string>(Object.values(CHECK_NAME));

function isCheckName(value: string): value is CheckName {
  return CHECK_NAMES.has(value);
}

/** Resolves and validates the effective diagnose check set for the current build. */
export function resolveDiagnoseCheckSet(
  config: DiagnoseConfig,
  availableChecks: readonly CheckName[],
): Result<readonly CheckName[]> {
  const configuredChecks = config.checks;
  if (configuredChecks === undefined) {
    return { ok: true, value: availableChecks };
  }

  const available = new Set<string>(availableChecks);
  const unavailable = configuredChecks.filter((name) => !isCheckName(name) || !available.has(name));
  if (unavailable.length > 0) {
    return {
      ok: false,
      error: `diagnose config \`checks\` names checks not available in this build: ${unavailable.join(", ")}`,
    };
  }

  return { ok: true, value: configuredChecks.filter(isCheckName) };
}

/**
 * Resolves the diagnostic facts into a manifest. With an explicit manifest the
 * manifest is authoritative and returned unchanged. Otherwise the check set
 * comes from configuration or, when absent, defaults to every available check,
 * and each consumer fact comes from configuration or is left absent for the
 * check to degrade against. A configured check absent from this build is
 * rejected, consistent with the manifest contract.
 */
export function resolveDiagnoseFacts(options: {
  readonly manifest?: DiagnoseManifest;
  readonly config: DiagnoseConfig;
  readonly methodology?: MethodologyConfig;
  readonly methodologyError?: string;
  readonly availableChecks: readonly CheckName[];
}): Result<DiagnoseManifest> {
  if (options.manifest !== undefined) {
    return { ok: true, value: options.manifest };
  }

  const { config, availableChecks } = options;
  const checks = resolveDiagnoseCheckSet(config, availableChecks);
  if (!checks.ok) return checks;

  return {
    ok: true,
    value: {
      checks: checks.value,
      spxFloor: config.spxFloor,
      marketplace: config.marketplace,
      expectedPlugins: config.expectedPlugins,
      methodology: options.methodology,
      methodologyError: options.methodologyError,
    },
  };
}
