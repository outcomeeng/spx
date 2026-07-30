import type { MethodologyConfig } from "@/config/methodology";
import type { CheckRunner } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { type CheckRecord, VERDICT_BUCKET } from "@/domains/diagnose/types";

export const METHODOLOGY_CONTEXT_VERDICT = {
  RESOLVED: "resolved",
  UNDECLARED: "undeclared",
  UNAVAILABLE: "unavailable",
  UNKNOWN: "unknown",
} as const;

export type MethodologyContextVerdict = (typeof METHODOLOGY_CONTEXT_VERDICT)[keyof typeof METHODOLOGY_CONTEXT_VERDICT];

export const METHODOLOGY_CONTEXT_READING_VALUE = {
  ABSENT: "(absent)",
  NONE: "(none)",
} as const;

/** What the probe observes about the committed methodology trees under the product directory. */
export interface MethodologyContextObservation {
  /** Coding agents whose committed tree exists for the declared methodology version. */
  readonly materializedCodingAgents: readonly string[];
  readonly errored: boolean;
}

export interface MethodologyContextReading {
  readonly configured: boolean;
  readonly configuredSource: string | null;
  readonly configuredVersion: string | null;
  readonly migratingFrom: string | null;
  readonly materializedCodingAgents: readonly string[];
  readonly errored: boolean;
}

export interface MethodologyContextProbe {
  probe(config: MethodologyConfig): Promise<MethodologyContextObservation>;
}

const REMEDIATION: Readonly<Record<MethodologyContextVerdict, string>> = {
  [METHODOLOGY_CONTEXT_VERDICT.RESOLVED]: "Declared methodology resolves to committed trees; no action needed.",
  [METHODOLOGY_CONTEXT_VERDICT.UNDECLARED]:
    "Declare methodology.version; the product's methodology identity has no default.",
  [METHODOLOGY_CONTEXT_VERDICT.UNAVAILABLE]:
    "Materialize the committed methodology tree for the declared version and each enabled coding agent.",
  [METHODOLOGY_CONTEXT_VERDICT.UNKNOWN]:
    "Re-run diagnose; if it persists, inspect the committed methodology trees under the product directory.",
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
      migratingFrom: readingValue(reading.migratingFrom),
      materializedCodingAgents: reading.materializedCodingAgents.length === 0
        ? METHODOLOGY_CONTEXT_READING_VALUE.NONE
        : [...reading.materializedCodingAgents].join(", "),
    },
    remediation: REMEDIATION[verdict],
  };
}

export function classifyMethodologyContext(reading: MethodologyContextReading): CheckRecord {
  if (reading.errored) {
    return record(METHODOLOGY_CONTEXT_VERDICT.UNKNOWN, VERDICT_BUCKET.UNKNOWN, reading);
  }
  if (reading.configuredVersion === null) {
    return record(METHODOLOGY_CONTEXT_VERDICT.UNDECLARED, VERDICT_BUCKET.DEGRADED, reading);
  }
  if (reading.materializedCodingAgents.length === 0) {
    return record(METHODOLOGY_CONTEXT_VERDICT.UNAVAILABLE, VERDICT_BUCKET.DEGRADED, reading);
  }
  return record(METHODOLOGY_CONTEXT_VERDICT.RESOLVED, VERDICT_BUCKET.HEALTHY, reading);
}

export function methodologyContextRunner(probe: MethodologyContextProbe): CheckRunner {
  return async (manifest) => {
    if (manifest.methodologyError !== undefined || manifest.methodology === undefined) {
      return classifyMethodologyContext({
        configured: manifest.methodologyError !== undefined,
        configuredSource: null,
        configuredVersion: null,
        migratingFrom: null,
        materializedCodingAgents: [],
        errored: true,
      });
    }

    const methodology = manifest.methodology;
    const observation = await probe.probe(methodology);
    return classifyMethodologyContext({
      configured: true,
      configuredSource: methodology.source,
      configuredVersion: methodology.version ?? null,
      migratingFrom: methodology.migratingFrom ?? null,
      materializedCodingAgents: observation.materializedCodingAgents,
      errored: observation.errored,
    });
  };
}
