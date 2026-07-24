import { METHODOLOGY_VERSION_INTENT, type MethodologyConfig, methodologyVersionIntent } from "@/config/methodology";
import type { CheckRunner } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { type CheckRecord, VERDICT_BUCKET } from "@/domains/diagnose/types";

export const METHODOLOGY_CONTEXT_VERDICT = {
  RESOLVED: "resolved",
  BOOTSTRAP_IDENTITY: "bootstrap-identity",
  VERSION_MISMATCH: "version-mismatch",
  UNAVAILABLE: "unavailable",
  UNKNOWN: "unknown",
} as const;

export type MethodologyContextVerdict = (typeof METHODOLOGY_CONTEXT_VERDICT)[keyof typeof METHODOLOGY_CONTEXT_VERDICT];

export const METHODOLOGY_CONTEXT_READING_VALUE = {
  ABSENT: "(absent)",
} as const;

export interface MethodologyContextObservation {
  readonly source: string | null;
  readonly version: string | null;
  /** Whether the product directory carries a tracked spec tree, observed by the probe rather than the classifier. */
  readonly trackedSpecTree: boolean;
  readonly errored: boolean;
}

export interface MethodologyContextReading {
  readonly configured: boolean;
  readonly configuredSource: string | null;
  readonly configuredVersion: string | null;
  readonly observedSource: string | null;
  readonly observedVersion: string | null;
  readonly trackedSpecTree: boolean;
  readonly errored: boolean;
}

export interface MethodologyContextProbe {
  probe(config: MethodologyConfig): Promise<MethodologyContextObservation>;
}

const REMEDIATION: Readonly<Record<MethodologyContextVerdict, string>> = {
  [METHODOLOGY_CONTEXT_VERDICT.RESOLVED]: "Configured methodology context resolves locally; no action needed.",
  [METHODOLOGY_CONTEXT_VERDICT.BOOTSTRAP_IDENTITY]:
    "Declare an exact methodology.version; the installed sentinel is bootstrap intent, not durable identity.",
  [METHODOLOGY_CONTEXT_VERDICT.VERSION_MISMATCH]:
    "Install the configured methodology version or change the methodology config.",
  [METHODOLOGY_CONTEXT_VERDICT.UNAVAILABLE]:
    "Install the configured methodology source or make it visible to the local agent runtime.",
  [METHODOLOGY_CONTEXT_VERDICT.UNKNOWN]:
    "Re-run diagnose; if it persists, inspect local methodology plugin installation state.",
};

function readingValue(value: string | null): string {
  return value ?? METHODOLOGY_CONTEXT_READING_VALUE.ABSENT;
}

/**
 * The declared version's intent, so a report reader distinguishes bootstrap intent from an
 * exact declaration without re-deriving the sentinel comparison from the raw version reading.
 */
function versionIntentReading(configuredVersion: string | null): string {
  return configuredVersion === null
    ? METHODOLOGY_CONTEXT_READING_VALUE.ABSENT
    : methodologyVersionIntent(configuredVersion);
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
      versionIntent: versionIntentReading(reading.configuredVersion),
      trackedSpecTree: String(reading.trackedSpecTree),
    },
    remediation: REMEDIATION[verdict],
  };
}

export function classifyMethodologyContext(reading: MethodologyContextReading): CheckRecord {
  if (reading.errored) {
    return record(METHODOLOGY_CONTEXT_VERDICT.UNKNOWN, VERDICT_BUCKET.UNKNOWN, reading);
  }
  if (reading.observedSource === null || reading.observedVersion === null) {
    return record(METHODOLOGY_CONTEXT_VERDICT.UNAVAILABLE, VERDICT_BUCKET.UNKNOWN, reading);
  }
  const intent = versionIntentReading(reading.configuredVersion);
  if (intent === METHODOLOGY_VERSION_INTENT.BOOTSTRAP && reading.trackedSpecTree) {
    return record(METHODOLOGY_CONTEXT_VERDICT.BOOTSTRAP_IDENTITY, VERDICT_BUCKET.DEGRADED, reading);
  }
  if (intent === METHODOLOGY_VERSION_INTENT.EXACT && reading.configuredVersion !== reading.observedVersion) {
    return record(METHODOLOGY_CONTEXT_VERDICT.VERSION_MISMATCH, VERDICT_BUCKET.DEGRADED, reading);
  }
  return record(METHODOLOGY_CONTEXT_VERDICT.RESOLVED, VERDICT_BUCKET.HEALTHY, reading);
}

export function methodologyContextRunner(probe: MethodologyContextProbe): CheckRunner {
  return async (manifest) => {
    if (manifest.methodologyError !== undefined) {
      return classifyMethodologyContext({
        configured: true,
        configuredSource: null,
        configuredVersion: null,
        observedSource: null,
        observedVersion: null,
        trackedSpecTree: false,
        errored: true,
      });
    }
    if (manifest.methodology === undefined) {
      return classifyMethodologyContext({
        configured: false,
        configuredSource: null,
        configuredVersion: null,
        observedSource: null,
        observedVersion: null,
        trackedSpecTree: false,
        errored: true,
      });
    }

    const methodology = manifest.methodology;
    const observation = await probe.probe(methodology);
    return classifyMethodologyContext({
      configured: true,
      configuredSource: methodology.source,
      configuredVersion: methodology.version,
      observedSource: observation.source,
      observedVersion: observation.version,
      trackedSpecTree: observation.trackedSpecTree,
      errored: observation.errored,
    });
  };
}
