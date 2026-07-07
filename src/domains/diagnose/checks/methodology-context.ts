import { DEFAULT_METHODOLOGY_VERSION, type MethodologyConfig } from "@/config/methodology";
import type { CheckRunner } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { type CheckRecord, VERDICT_BUCKET } from "@/domains/diagnose/types";

export const METHODOLOGY_CONTEXT_VERDICT = {
  RESOLVED: "resolved",
  CONFIGURED: "configured",
  SOURCE_MISMATCH: "source-mismatch",
  VERSION_MISMATCH: "version-mismatch",
  UNAVAILABLE: "unavailable",
  NOT_APPLICABLE: "not-applicable",
  UNKNOWN: "unknown",
} as const;

export type MethodologyContextVerdict = (typeof METHODOLOGY_CONTEXT_VERDICT)[keyof typeof METHODOLOGY_CONTEXT_VERDICT];

export const METHODOLOGY_CONTEXT_READING_VALUE = {
  ABSENT: "(absent)",
} as const;

export interface MethodologyContextObservation {
  readonly source: string | null;
  readonly version: string | null;
  readonly errored: boolean;
}

export interface MethodologyContextReading {
  readonly configured: boolean;
  readonly configuredSource: string | null;
  readonly configuredVersion: string | null;
  readonly observedSource: string | null;
  readonly observedVersion: string | null;
  readonly errored: boolean;
}

export interface MethodologyContextProbe {
  probe(config: MethodologyConfig): Promise<MethodologyContextObservation>;
}

const REMEDIATION: Readonly<Record<MethodologyContextVerdict, string>> = {
  [METHODOLOGY_CONTEXT_VERDICT.RESOLVED]: "Configured methodology context resolves locally; no action needed.",
  [METHODOLOGY_CONTEXT_VERDICT.CONFIGURED]:
    "Methodology context is configured, but no local installed version was observed.",
  [METHODOLOGY_CONTEXT_VERDICT.SOURCE_MISMATCH]: "Install or select the configured methodology source.",
  [METHODOLOGY_CONTEXT_VERDICT.VERSION_MISMATCH]:
    "Install the configured methodology version or change the methodology config.",
  [METHODOLOGY_CONTEXT_VERDICT.UNAVAILABLE]:
    "Install the configured methodology source or make it visible to the local agent runtime.",
  [METHODOLOGY_CONTEXT_VERDICT.NOT_APPLICABLE]: "Methodology context is not configured for this diagnose run.",
  [METHODOLOGY_CONTEXT_VERDICT.UNKNOWN]:
    "Re-run diagnose; if it persists, inspect local methodology plugin installation state.",
};

function readingValue(value: string | null): string {
  return value ?? METHODOLOGY_CONTEXT_READING_VALUE.ABSENT;
}

function record(
  verdict: MethodologyContextVerdict,
  bucket: CheckRecord["bucket"],
  reading: MethodologyContextReading,
): CheckRecord {
  return {
    name: CHECK_NAME.METHODOLOGY_CONTEXT,
    verdict,
    bucket,
    readings: {
      configured: String(reading.configured),
      configuredSource: readingValue(reading.configuredSource),
      configuredVersion: readingValue(reading.configuredVersion),
      observedSource: readingValue(reading.observedSource),
      observedVersion: readingValue(reading.observedVersion),
    },
    remediation: REMEDIATION[verdict],
  };
}

export function classifyMethodologyContext(reading: MethodologyContextReading): CheckRecord {
  if (reading.errored) {
    return record(METHODOLOGY_CONTEXT_VERDICT.UNKNOWN, VERDICT_BUCKET.UNKNOWN, reading);
  }
  if (!reading.configured) {
    return record(METHODOLOGY_CONTEXT_VERDICT.NOT_APPLICABLE, VERDICT_BUCKET.NOT_APPLICABLE, reading);
  }
  if (reading.observedSource === null || reading.observedVersion === null) {
    return record(METHODOLOGY_CONTEXT_VERDICT.UNAVAILABLE, VERDICT_BUCKET.UNKNOWN, reading);
  }
  if (reading.configuredSource !== reading.observedSource) {
    return record(METHODOLOGY_CONTEXT_VERDICT.SOURCE_MISMATCH, VERDICT_BUCKET.BROKEN, reading);
  }
  if (
    reading.configuredVersion !== DEFAULT_METHODOLOGY_VERSION
    && reading.configuredVersion !== reading.observedVersion
  ) {
    return record(METHODOLOGY_CONTEXT_VERDICT.VERSION_MISMATCH, VERDICT_BUCKET.DEGRADED, reading);
  }
  return record(METHODOLOGY_CONTEXT_VERDICT.RESOLVED, VERDICT_BUCKET.HEALTHY, reading);
}

export function methodologyContextRunner(probe: MethodologyContextProbe): CheckRunner {
  return async (manifest) => {
    if (manifest.methodology === undefined) {
      return classifyMethodologyContext({
        configured: false,
        configuredSource: null,
        configuredVersion: null,
        observedSource: null,
        observedVersion: null,
        errored: false,
      });
    }

    const observation = await probe.probe(manifest.methodology);
    return classifyMethodologyContext({
      configured: true,
      configuredSource: manifest.methodology.source,
      configuredVersion: manifest.methodology.version,
      observedSource: observation.source,
      observedVersion: observation.version,
      errored: observation.errored,
    });
  };
}
