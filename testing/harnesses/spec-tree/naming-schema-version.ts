import * as fc from "fast-check";
import { expect } from "vitest";

import {
  canonicalNamingSchemaVersion,
  compareNamingSchemaVersions,
  SPEC_TREE_GRAMMAR,
  supersededNodeSuffixes,
} from "@/lib/spec-tree";
import { NAMING_SCHEMA_VERSION_TEST_GENERATOR } from "@testing/generators/spec-tree/naming-schema-version";

const PROPERTY_RUN_COUNT = NAMING_SCHEMA_VERSION_TEST_GENERATOR.counts.propertyRunCount;
const SEMVER_COMPONENT_SEPARATOR = ".";

function compareSemverOracle(left: string, right: string): number {
  const leftComponents = left.split(SEMVER_COMPONENT_SEPARATOR).map((part) => Number(part));
  const rightComponents = right.split(SEMVER_COMPONENT_SEPARATOR).map((part) => Number(part));
  const length = Math.max(leftComponents.length, rightComponents.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftComponents[index] ?? 0) - (rightComponents[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function assertNamingSchemaVersionsFollowSemanticOrder(): void {
  fc.assert(
    fc.property(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.version(),
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.version(),
      (left, right) => {
        expect(Math.sign(compareNamingSchemaVersions(left, right))).toBe(
          Math.sign(compareSemverOracle(left.version, right.version)),
        );
      },
    ),
    { numRuns: PROPERTY_RUN_COUNT },
  );
}

export function assertCanonicalNamingSchemaVersionIsSemanticMaximum(): void {
  fc.assert(
    fc.property(NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(), (versions) => {
      const canonical = canonicalNamingSchemaVersion(versions);
      const oracleMaximum = versions.reduce((maximum, version) =>
        compareSemverOracle(version.version, maximum.version) > 0 ? version : maximum
      );
      expect(canonical.version).toBe(oracleMaximum.version);
    }),
    { numRuns: PROPERTY_RUN_COUNT },
  );
}

export function assertCanonicalNamingSchemaVersionBelongsToTuple(): void {
  fc.assert(
    fc.property(NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(), (versions) => {
      expect(versions).toContain(canonicalNamingSchemaVersion(versions));
    }),
    { numRuns: PROPERTY_RUN_COUNT },
  );
}

export function assertNonNumericNamingSchemaVersionIsRejected(): void {
  fc.assert(
    fc.property(NAMING_SCHEMA_VERSION_TEST_GENERATOR.version(), (version) => {
      const prerelease = { ...version, version: `${version.version}-alpha` };
      expect(() => compareNamingSchemaVersions(prerelease, version)).toThrow();
    }),
    { numRuns: PROPERTY_RUN_COUNT },
  );
}

export function assertSupersededSuffixesComeFromPriorVersions(): void {
  fc.assert(
    fc.property(NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(), (versions) => {
      const canonical = canonicalNamingSchemaVersion(versions);
      const canonicalSuffixes = new Set(canonical.nodeSuffixes);
      const expected = new Set<string>();
      for (const version of versions) {
        if (version === canonical) continue;
        for (const suffix of version.nodeSuffixes) {
          if (!canonicalSuffixes.has(suffix)) expected.add(suffix);
        }
      }
      expect(new Set(supersededNodeSuffixes(versions))).toEqual(expected);
    }),
    { numRuns: PROPERTY_RUN_COUNT },
  );
}

export function assertCanonicalSuffixesAreNeverSuperseded(): void {
  fc.assert(
    fc.property(NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(), (versions) => {
      const canonicalSuffixes = new Set(canonicalNamingSchemaVersion(versions).nodeSuffixes);
      for (const suffix of supersededNodeSuffixes(versions)) {
        expect(canonicalSuffixes.has(suffix)).toBe(false);
      }
    }),
    { numRuns: PROPERTY_RUN_COUNT },
  );
}

export function assertNamingSchemaVersionsCarryAllFilenameForms(): void {
  fc.assert(
    fc.property(NAMING_SCHEMA_VERSION_TEST_GENERATOR.version(), (version) => {
      expect(Array.isArray(version.nodeSuffixes)).toBe(true);
      expect(Array.isArray(version.decisionSuffixes)).toBe(true);
      expect(version.productSuffix.length).toBeGreaterThan(0);
      expect(Array.isArray(version.runners)).toBe(true);
      expect(version.evidence).toBeDefined();
      expect(version.order).toBeDefined();
      expect(Array.isArray(version.coordinationNotes)).toBe(true);
      expect(version.eval.DIRECTORY_NAME.length).toBeGreaterThan(0);
      expect(Array.isArray(version.eval.FILES)).toBe(true);
      expect(version.eval.RUNS_DIRECTORY_NAME.length).toBeGreaterThan(0);
      expect(version.specFileSuffix.length).toBeGreaterThan(0);
    }),
    { numRuns: PROPERTY_RUN_COUNT },
  );
}

export function assertNamingSchemaSpecFileSuffixMatchesVersionRole(): void {
  fc.assert(
    fc.property(NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(), (versions) => {
      const canonical = canonicalNamingSchemaVersion(versions);
      for (const version of versions) {
        const expected = version === canonical
          ? SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX
          : SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX;
        expect(version.specFileSuffix).toBe(expected);
      }
    }),
    { numRuns: PROPERTY_RUN_COUNT },
  );
}
