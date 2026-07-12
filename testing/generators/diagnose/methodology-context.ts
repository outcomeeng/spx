/** Coherent generated scenarios for methodology-context diagnose evidence. */

import fc from "fast-check";

import { DEFAULT_METHODOLOGY_VERSION, type MethodologyConfig } from "@/config/methodology";
import { AGENT_HOME_ENV } from "@/domains/agent";
import type { MethodologyContextObservation } from "@/domains/diagnose/checks/methodology-context";

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
  readonly agentHomeEnv: (typeof AGENT_HOME_ENV)[keyof typeof AGENT_HOME_ENV];
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
  arbitraryNameToken().filter((value) => !/^\d+(?:\.\d+)*$/.test(value));

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
  return fc.tuple(
    arbitraryMethodologySource(),
    arbitraryOrderedVersions(),
    arbitraryNonVersionDirectory(),
    fc.constantFrom("installed", "exact-present", "exact-missing", "exact-non-version"),
  ).map(([source, versions, nonVersion, mode]) => {
    const versionDirectories = [versions.lower, versions.installed, versions.higher, nonVersion];
    if (mode === "exact-present") {
      return {
        methodology: { source, version: versions.installed },
        versionDirectories,
        expectedVersion: versions.installed,
      };
    }
    if (mode === "exact-non-version") {
      return {
        methodology: { source, version: nonVersion },
        versionDirectories,
        expectedVersion: nonVersion,
      };
    }
    return {
      methodology: {
        source,
        version: mode === "installed" ? DEFAULT_METHODOLOGY_VERSION : `${versions.higher}.1`,
      },
      versionDirectories,
      expectedVersion: versions.higher,
    };
  });
}

export function cacheReadErrorFileContent(): string {
  return sampleDiagnoseTestValue(arbitraryNameToken());
}

export const SUPPORTED_AGENT_CACHE_CASES: readonly SupportedAgentCacheCase[] = [
  { name: "Codex", agentHomeEnv: AGENT_HOME_ENV.CODEX },
  { name: "Claude", agentHomeEnv: AGENT_HOME_ENV.CLAUDE },
];
