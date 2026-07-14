import * as fc from "fast-check";
import { expect } from "vitest";

import {
  canonicalNamingSchemaVersion,
  compareNamingSchemaVersions,
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
  supersededNodeSuffixes,
} from "@/lib/spec-tree";
import { NAMING_SCHEMA_VERSION_TEST_GENERATOR } from "@testing/generators/spec-tree/naming-schema-version";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { expectPresent } from "@testing/harnesses/spec-tree/assertions";

const SEMVER_COMPONENT_SEPARATOR = ".";
const L1_PROPERTY = { level: PROPERTY_LEVEL.L1 } as const;

function directoryRecord(order: number, slug: string, suffix: string) {
  return {
    type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
    relativePath: `${order}-${slug}${suffix}`,
  };
}

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
  assertProperty(
    NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionComparisonPair(),
    ([left, right]) => {
      expect(Math.sign(compareNamingSchemaVersions(left, right))).toBe(
        Math.sign(compareSemverOracle(left.version, right.version)),
      );
    },
    L1_PROPERTY,
  );
}

export function assertCanonicalNamingSchemaVersionIsSemanticMaximum(): void {
  assertProperty(
    NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(),
    (versions) => {
      const canonical = canonicalNamingSchemaVersion(versions);
      const oracleMaximum = versions.reduce((maximum, version) =>
        compareSemverOracle(version.version, maximum.version) > 0 ? version : maximum
      );
      expect(canonical.version).toBe(oracleMaximum.version);
    },
    L1_PROPERTY,
  );
}

export function assertCanonicalNamingSchemaVersionBelongsToTuple(): void {
  assertProperty(
    NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(),
    (versions) => {
      expect(versions).toContain(canonicalNamingSchemaVersion(versions));
    },
    L1_PROPERTY,
  );
}

export function assertNonNumericNamingSchemaVersionIsRejected(): void {
  assertProperty(
    NAMING_SCHEMA_VERSION_TEST_GENERATOR.nonNumericVersionPair(),
    ({ invalid, valid }) => {
      expect(() => compareNamingSchemaVersions(invalid, valid)).toThrow();
    },
    L1_PROPERTY,
  );
}

export function assertSupersededSuffixesComeFromPriorVersions(): void {
  assertProperty(
    NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(),
    (versions) => {
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
    },
    L1_PROPERTY,
  );
}

export function assertCanonicalSuffixesAreNeverSuperseded(): void {
  assertProperty(
    NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(),
    (versions) => {
      const canonicalSuffixes = new Set(canonicalNamingSchemaVersion(versions).nodeSuffixes);
      for (const suffix of supersededNodeSuffixes(versions)) {
        expect(canonicalSuffixes.has(suffix)).toBe(false);
      }
    },
    L1_PROPERTY,
  );
}

export function assertNamingSchemaVersionsCarryAllFilenameForms(): void {
  for (const version of SPEC_TREE_NAMING_SCHEMA_VERSIONS) {
    assertNamingSchemaVersionCarriesAllFilenameForms(version);
  }
  assertProperty(
    NAMING_SCHEMA_VERSION_TEST_GENERATOR.version(),
    assertNamingSchemaVersionCarriesAllFilenameForms,
    L1_PROPERTY,
  );
}

function assertNamingSchemaVersionCarriesAllFilenameForms(
  version: (typeof SPEC_TREE_NAMING_SCHEMA_VERSIONS)[number],
): void {
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
}

export function assertNamingSchemaSpecFileSuffixMatchesVersionRole(): void {
  assertProperty(
    NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(),
    (versions) => {
      const canonical = canonicalNamingSchemaVersion(versions);
      for (const version of versions) {
        const expected = version === canonical
          ? SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX
          : SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX;
        expect(version.specFileSuffix).toBe(expected);
      }
    },
    L1_PROPERTY,
  );
}

export function assertCanonicalVersionNameMapsToValidEntry(): void {
  assertProperty(
    fc.tuple(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.recognitionScenario(),
      SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
      SPEC_TREE_TEST_GENERATOR.sourceSlug(),
    ),
    ([scenario, order, slug]) => {
      const entry = expectPresent(
        recognizeSpecTreeFilesystemEntry(directoryRecord(order, slug, scenario.validNodeSuffix), {
          schemaVersions: scenario.schemaVersions,
        }),
      );
      expect(entry.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
    },
    L1_PROPERTY,
  );
}

export function assertPriorVersionNameMapsToSupersededEntry(): void {
  assertProperty(
    fc.tuple(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.recognitionScenario(),
      SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
      SPEC_TREE_TEST_GENERATOR.sourceSlug(),
    ),
    ([scenario, order, slug]) => {
      const entry = expectPresent(
        recognizeSpecTreeFilesystemEntry(directoryRecord(order, slug, scenario.supersededNodeSuffix), {
          schemaVersions: scenario.schemaVersions,
        }),
      );
      expect(entry.type).toBe(SPEC_TREE_ENTRY_TYPE.SUPERSEDED);
      if (entry.type === SPEC_TREE_ENTRY_TYPE.SUPERSEDED) {
        expect(entry.version).toBe(scenario.supersededVersion);
      }
    },
    L1_PROPERTY,
  );
}

export function assertUnknownVersionNameMapsToInvalidEntry(): void {
  assertProperty(
    fc.tuple(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.recognitionScenario(),
      SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
      SPEC_TREE_TEST_GENERATOR.sourceSlug(),
    ),
    ([scenario, order, slug]) => {
      const entry = expectPresent(
        recognizeSpecTreeFilesystemEntry(directoryRecord(order, slug, scenario.invalidNodeSuffix), {
          schemaVersions: scenario.schemaVersions,
        }),
      );
      expect(entry.type).toBe(SPEC_TREE_ENTRY_TYPE.INVALID);
    },
    L1_PROPERTY,
  );
}

export function assertInjectedCanonicalVersionGovernsValidity(): void {
  assertProperty(
    fc.tuple(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.demotedRegistrySuffixScenario(),
      SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
      SPEC_TREE_TEST_GENERATOR.sourceSlug(),
    ),
    ([scenario, order, slug]) => {
      const entry = expectPresent(
        recognizeSpecTreeFilesystemEntry(directoryRecord(order, slug, scenario.demotedRegistrySuffix), {
          schemaVersions: scenario.schemaVersions,
        }),
      );
      expect(entry.type).toBe(SPEC_TREE_ENTRY_TYPE.SUPERSEDED);
      if (entry.type === SPEC_TREE_ENTRY_TYPE.SUPERSEDED) {
        expect(entry.version).toBe(scenario.demotedVersion);
      }
    },
    L1_PROPERTY,
  );
}

export function assertCanonicalForeignSuffixMapsToInvalidEntry(): void {
  assertProperty(
    fc.tuple(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.canonicalForeignSuffixScenario(),
      SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
      SPEC_TREE_TEST_GENERATOR.sourceSlug(),
    ),
    ([scenario, order, slug]) => {
      const entry = expectPresent(
        recognizeSpecTreeFilesystemEntry(directoryRecord(order, slug, scenario.foreignCanonicalSuffix), {
          schemaVersions: scenario.schemaVersions,
        }),
      );
      expect(entry.type).toBe(SPEC_TREE_ENTRY_TYPE.INVALID);
    },
    L1_PROPERTY,
  );
}

export function assertInjectedEvidenceGrammarGovernsRecognition(): void {
  assertProperty(
    fc.tuple(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.injectedEvidenceGrammarScenario(),
      SPEC_TREE_TEST_GENERATOR.sourceSlug(),
    ),
    ([scenario, parentId]) => {
      const entry = expectPresent(
        recognizeSpecTreeFilesystemEntry(
          {
            type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
            relativePath: scenario.relativePath,
            parentId,
          },
          { schemaVersions: scenario.schemaVersions },
        ),
      );
      expect(entry.type).toBe(SPEC_TREE_ENTRY_TYPE.EVIDENCE);
    },
    L1_PROPERTY,
  );
}
