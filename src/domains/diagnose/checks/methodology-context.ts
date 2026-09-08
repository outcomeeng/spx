import type { MethodologyConfig } from "@/config/methodology";
import type { CheckRunner } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { type CheckRecord, VERDICT_BUCKET } from "@/domains/diagnose/types";
import type { ProviderMatch } from "@/lib/methodology/provider-match";

export const METHODOLOGY_CONTEXT_VERDICT = {
  RESOLVED: "resolved",
  UNDECLARED: "undeclared",
  UNAVAILABLE: "unavailable",
  MISMATCHED: "mismatched",
  UNKNOWN: "unknown",
} as const;

export type MethodologyContextVerdict = (typeof METHODOLOGY_CONTEXT_VERDICT)[keyof typeof METHODOLOGY_CONTEXT_VERDICT];

export const METHODOLOGY_CONTEXT_READING_VALUE = {
  ABSENT: "(absent)",
  NONE: "(none)",
} as const;

const READING_LIST_SEPARATOR = ", ";

/** What the probe observes about spx's shipped trees against the declared methodology. */
export interface MethodologyContextObservation {
  /** The line the declared version derives to; absent when no exact version is declared. */
  readonly line: string | undefined;
  /** Every line spx ships. */
  readonly shippedLines: readonly string[];
  /** Coding agents the declared line ships a tree for. */
  readonly shippedCodingAgents: readonly string[];
  /** Coding agents the product enables, in the shipped-tree vocabulary. */
  readonly enabledCodingAgents: readonly string[];
  /** The provider-declaration check per enabled agent, or the mismatch diagnostic. */
  readonly providerMatch: ProviderMatch | undefined;
  readonly providerMismatch: string | undefined;
  readonly errored: boolean;
}

export interface MethodologyContextReading extends MethodologyContextObservation {
  readonly configured: boolean;
  readonly configuredSource: string | null;
  readonly configuredVersion: string | null;
  readonly migratingFrom: string | null;
}

export interface MethodologyContextProbe {
  probe(config: MethodologyConfig): Promise<MethodologyContextObservation>;
}

const REMEDIATION: Readonly<Record<MethodologyContextVerdict, string>> = {
  [METHODOLOGY_CONTEXT_VERDICT.RESOLVED]: "Declared methodology resolves to shipped trees; no action needed.",
  [METHODOLOGY_CONTEXT_VERDICT.UNDECLARED]:
    "Declare an exact methodology.version; the product's methodology identity has no default.",
  [METHODOLOGY_CONTEXT_VERDICT.UNAVAILABLE]:
    "Declare a methodology version whose line spx ships for every enabled coding agent, or update spx.",
  [METHODOLOGY_CONTEXT_VERDICT.MISMATCHED]:
    "Align methodology.version and methodology.migratingFrom with the provider declaration the shipped tree records.",
  [METHODOLOGY_CONTEXT_VERDICT.UNKNOWN]: "Re-run diagnose; if it persists, inspect spx's shipped methodology trees.",
};

function readingValue(value: string | null | undefined): string {
  return value ?? METHODOLOGY_CONTEXT_READING_VALUE.ABSENT;
}

function readingList(values: readonly string[]): string {
  return values.length === 0 ? METHODOLOGY_CONTEXT_READING_VALUE.NONE : values.join(READING_LIST_SEPARATOR);
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
      line: readingValue(reading.line),
      shippedLines: readingList(reading.shippedLines),
      shippedCodingAgents: readingList(reading.shippedCodingAgents),
      enabledCodingAgents: readingList(reading.enabledCodingAgents),
      providerMatch: readingValue(reading.providerMismatch ?? reading.providerMatch),
    },
    remediation: REMEDIATION[verdict],
  };
}

function everyEnabledAgentShipped(reading: MethodologyContextReading): boolean {
  return reading.shippedCodingAgents.length > 0
    && reading.enabledCodingAgents.every((agent) => reading.shippedCodingAgents.includes(agent));
}

export function classifyMethodologyContext(reading: MethodologyContextReading): CheckRecord {
  if (reading.errored) {
    return record(METHODOLOGY_CONTEXT_VERDICT.UNKNOWN, VERDICT_BUCKET.UNKNOWN, reading);
  }
  if (reading.configuredVersion === null || reading.line === undefined) {
    return record(METHODOLOGY_CONTEXT_VERDICT.UNDECLARED, VERDICT_BUCKET.DEGRADED, reading);
  }
  if (!reading.shippedLines.includes(reading.line) || !everyEnabledAgentShipped(reading)) {
    return record(METHODOLOGY_CONTEXT_VERDICT.UNAVAILABLE, VERDICT_BUCKET.DEGRADED, reading);
  }
  if (reading.providerMismatch !== undefined) {
    return record(METHODOLOGY_CONTEXT_VERDICT.MISMATCHED, VERDICT_BUCKET.BROKEN, reading);
  }
  return record(METHODOLOGY_CONTEXT_VERDICT.RESOLVED, VERDICT_BUCKET.HEALTHY, reading);
}

const EMPTY_OBSERVATION: MethodologyContextObservation = {
  line: undefined,
  shippedLines: [],
  shippedCodingAgents: [],
  enabledCodingAgents: [],
  providerMatch: undefined,
  providerMismatch: undefined,
  errored: true,
};

export function methodologyContextRunner(probe: MethodologyContextProbe): CheckRunner {
  return async (manifest) => {
    if (manifest.methodologyError !== undefined || manifest.methodology === undefined) {
      return classifyMethodologyContext({
        ...EMPTY_OBSERVATION,
        configured: manifest.methodologyError !== undefined,
        configuredSource: null,
        configuredVersion: null,
        migratingFrom: null,
      });
    }

    const methodology = manifest.methodology;
    const observation = await probe.probe(methodology);
    return classifyMethodologyContext({
      ...observation,
      configured: true,
      configuredSource: methodology.source,
      configuredVersion: methodology.version ?? null,
      migratingFrom: methodology.migratingFrom ?? null,
    });
  };
}
