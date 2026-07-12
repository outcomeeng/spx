/** Coherent generated scenarios for methodology-context diagnose evidence. */

import fc from "fast-check";

import { METHODOLOGY_CACHE_HOME_KEYS } from "@/commands/diagnose/probes";
import {
  DEFAULT_METHODOLOGY_VERSION,
  METHODOLOGY_CONFIG_FIELDS,
  METHODOLOGY_SECTION,
  type MethodologyConfig,
} from "@/config/methodology";
import { LEGACY_METHODOLOGY_CONFIG_SECTION } from "@/config/methodology-placement";
import type { MethodologyContextObservation } from "@/domains/diagnose/checks/methodology-context";
import { DIAGNOSE_CONFIG_FIELDS, DIAGNOSE_SECTION } from "@/domains/diagnose/config";
import { CHECK_NAME, DIAGNOSE_MANIFEST_FIELDS } from "@/domains/diagnose/manifest";

import { arbitraryMethodologySource, arbitraryNameToken, arbitrarySpxFloor, sampleDiagnoseTestValue } from "./manifest";

export interface MethodologyDiagnoseScenario {
  readonly methodology: MethodologyConfig;
  readonly observation: MethodologyContextObservation;
}

export interface MethodologyVersionSelectionScenario {
  readonly methodology: MethodologyConfig;
  readonly versionDirectories: readonly string[];
  readonly expectedVersion: string;
}

export interface SupportedAgentCacheCase {
  readonly name: string;
  readonly homeKey: (typeof METHODOLOGY_CACHE_HOME_KEYS)[number];
}

export interface UnavailableCheckConfigScenario {
  readonly config: Record<string, unknown>;
  readonly unavailableCheck: string;
}

interface OrderedVersions {
  readonly lower: string;
  readonly installed: string;
  readonly higher: string;
}

const arbitraryOrderedVersions = (): fc.Arbitrary<OrderedVersions> =>
  fc.tuple(fc.nat(98), fc.nat(98), fc.nat(98)).map(([major, minor, patch]) => ({
    lower: `${major}.${minor}.${patch}`,
    installed: `${major}.${minor}.${patch + 1}`,
    higher: `${major}.${minor}.${patch + 2}`,
  }));

const arbitraryNonVersionDirectory = (): fc.Arbitrary<string> =>
  arbitraryNameToken().filter((value) =>
    !/^\d+(?:\.\d+)*$/.test(value) && !value.includes("/") && value !== "." && value !== ".."
  );

const arbitraryNumericDottedVersion = (): fc.Arbitrary<string> =>
  fc.array(fc.nat(999), { minLength: 1, maxLength: 4 }).map((segments) => segments.join("."));

function compareNumericDotted(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function sampledMethodology(version: string): MethodologyConfig {
  return {
    source: sampleDiagnoseTestValue(arbitraryMethodologySource()),
    version,
  };
}

export function resolvedMethodologyScenario(): MethodologyDiagnoseScenario {
  const version = sampleDiagnoseTestValue(arbitrarySpxFloor());
  const methodology = sampledMethodology(DEFAULT_METHODOLOGY_VERSION);
  return { methodology, observation: { source: methodology.source, version, errored: false } };
}

export function mismatchedMethodologyScenario(): MethodologyDiagnoseScenario {
  const versions = sampleDiagnoseTestValue(arbitraryOrderedVersions());
  const methodology = sampledMethodology(versions.lower);
  return {
    methodology,
    observation: { source: methodology.source, version: versions.installed, errored: false },
  };
}

export function unavailableMethodologyScenario(): MethodologyDiagnoseScenario {
  return {
    methodology: sampledMethodology(DEFAULT_METHODOLOGY_VERSION),
    observation: { source: null, version: null, errored: false },
  };
}

export function unknownMethodologyScenario(): MethodologyDiagnoseScenario {
  return {
    methodology: sampledMethodology(DEFAULT_METHODOLOGY_VERSION),
    observation: { source: null, version: null, errored: true },
  };
}

export function mixedCacheReadErrorScenario(): MethodologyDiagnoseScenario {
  const versions = sampleDiagnoseTestValue(arbitraryOrderedVersions());
  const methodology = sampledMethodology(versions.lower);
  return {
    methodology,
    observation: { source: methodology.source, version: versions.higher, errored: true },
  };
}

export function arbitraryMethodologyVersionSelectionScenario(): fc.Arbitrary<MethodologyVersionSelectionScenario> {
  return fc.record({
    source: arbitraryMethodologySource(),
    numericVersions: fc.uniqueArray(arbitraryNumericDottedVersion(), { minLength: 1, maxLength: 6 }),
    nonVersions: fc.uniqueArray(arbitraryNonVersionDirectory(), { minLength: 1, maxLength: 4 }),
    mode: fc.constantFrom("installed", "exact-present", "exact-missing", "exact-non-version"),
    order: fc.array(fc.nat(), { minLength: 10, maxLength: 10 }),
  }).map(({ source, numericVersions, nonVersions, mode, order }) => {
    const highest = [...numericVersions].sort(compareNumericDotted).at(-1);
    if (highest === undefined) throw new Error("methodology version generator produced no numeric version");
    const versionDirectories = [...numericVersions, ...nonVersions]
      .map((version, index) => ({ version, order: order[index] ?? index }))
      .sort((left, right) => left.order - right.order)
      .map(({ version }) => version);
    if (mode === "exact-present") {
      return {
        methodology: { source, version: numericVersions[0] },
        versionDirectories,
        expectedVersion: numericVersions[0],
      };
    }
    if (mode === "exact-non-version") {
      return {
        methodology: { source, version: nonVersions[0] },
        versionDirectories,
        expectedVersion: nonVersions[0],
      };
    }
    return {
      methodology: {
        source,
        version: mode === "installed" ? DEFAULT_METHODOLOGY_VERSION : `1000.${numericVersions.length}`,
      },
      versionDirectories,
      expectedVersion: highest,
    };
  });
}

export function cacheReadErrorFileContent(): string {
  return sampleDiagnoseTestValue(arbitraryNameToken());
}

export function manifestWithoutMethodologyJson(): string {
  return JSON.stringify({ [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.METHODOLOGY_CONTEXT] });
}

export function methodologyConfig(methodology: MethodologyConfig): Record<string, unknown> {
  return {
    [METHODOLOGY_SECTION]: {
      [METHODOLOGY_CONFIG_FIELDS.SOURCE]: methodology.source,
      [METHODOLOGY_CONFIG_FIELDS.VERSION]: methodology.version,
    },
  };
}

export function methodologyManifestJson(methodology: MethodologyConfig): string {
  return JSON.stringify({
    [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.METHODOLOGY_CONTEXT],
    [DIAGNOSE_MANIFEST_FIELDS.METHODOLOGY]: {
      [METHODOLOGY_CONFIG_FIELDS.SOURCE]: methodology.source,
      [METHODOLOGY_CONFIG_FIELDS.VERSION]: methodology.version,
    },
  });
}

export function legacyMethodologyConfig(): Record<string, unknown> {
  return {
    [LEGACY_METHODOLOGY_CONFIG_SECTION]: {
      [METHODOLOGY_SECTION]: resolvedMethodologyScenario().methodology,
    },
  };
}

export function methodologyWithUnrelatedLegacyConfig(methodology: MethodologyConfig): Record<string, unknown> {
  const unrelatedKey = sampleDiagnoseTestValue(arbitraryNameToken());
  return {
    ...methodologyConfig(methodology),
    [LEGACY_METHODOLOGY_CONFIG_SECTION]: {
      [unrelatedKey]: resolvedMethodologyScenario().methodology,
    },
  };
}

export function unavailableCheckConfigScenario(): UnavailableCheckConfigScenario {
  const unavailableCheck = sampleDiagnoseTestValue(arbitraryNameToken());
  return {
    unavailableCheck,
    config: {
      [DIAGNOSE_SECTION]: {
        [DIAGNOSE_CONFIG_FIELDS.CHECKS]: [CHECK_NAME.METHODOLOGY_CONTEXT, unavailableCheck],
      },
      ...legacyMethodologyConfig(),
    },
  };
}

export const SUPPORTED_AGENT_CACHE_CASES: readonly SupportedAgentCacheCase[] = METHODOLOGY_CACHE_HOME_KEYS.map(
  (homeKey) => ({ name: homeKey, homeKey }),
);
