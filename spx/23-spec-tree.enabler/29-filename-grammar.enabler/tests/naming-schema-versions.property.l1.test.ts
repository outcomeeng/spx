import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { canonicalNamingSchemaVersion, compareNamingSchemaVersions, supersededNodeSuffixes } from "@/lib/spec-tree";
import { NAMING_SCHEMA_VERSION_TEST_GENERATOR } from "@testing/generators/spec-tree/naming-schema-version";

const propertyRunCount = NAMING_SCHEMA_VERSION_TEST_GENERATOR.counts.propertyRunCount;

// Independent semantic-version oracle: re-derives ordering from the version string
// without consulting the module under test, so a degenerate comparator is caught.
function compareSemverOracle(left: string, right: string): number {
  const leftComponents = left.split(".").map((part) => Number(part));
  const rightComponents = right.split(".").map((part) => Number(part));
  const length = Math.max(leftComponents.length, rightComponents.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftComponents[index] ?? 0) - (rightComponents[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

describe("naming-schema version ordering", () => {
  it("orders versions exactly as the semantic-version oracle does", () => {
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
      { numRuns: propertyRunCount },
    );
  });

  it("selects the canonical version as the semantic-version maximum of the tuple", () => {
    fc.assert(
      fc.property(NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(), (versions) => {
        const canonical = canonicalNamingSchemaVersion(versions);
        const oracleMax = versions.reduce((max, version) =>
          compareSemverOracle(version.version, max.version) > 0 ? version : max
        );
        expect(canonical.version).toBe(oracleMax.version);
      }),
      { numRuns: propertyRunCount },
    );
  });

  it("selects the canonical version as a member of the tuple", () => {
    fc.assert(
      fc.property(NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(), (versions) => {
        expect(versions).toContain(canonicalNamingSchemaVersion(versions));
      }),
      { numRuns: propertyRunCount },
    );
  });

  it("rejects a non-numeric version identifier rather than mis-ordering it", () => {
    fc.assert(
      fc.property(NAMING_SCHEMA_VERSION_TEST_GENERATOR.version(), (version) => {
        // A prerelease identifier is not a numeric dotted version; the comparator
        // must fail loudly instead of parsing the prerelease component as zero.
        const prerelease = { ...version, version: `${version.version}-alpha` };
        expect(() => compareNamingSchemaVersions(prerelease, version)).toThrow();
      }),
      { numRuns: propertyRunCount },
    );
  });
});

describe("naming-schema superseded derivation", () => {
  it("derives the superseded node suffixes as the prior versions' suffixes less the canonical set", () => {
    fc.assert(
      fc.property(NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(), (versions) => {
        const canonical = canonicalNamingSchemaVersion(versions);
        const canonicalSuffixes = new Set(canonical.nodeSuffixes);
        const expected = new Set<string>();
        for (const version of versions) {
          if (version === canonical) {
            continue;
          }
          for (const suffix of version.nodeSuffixes) {
            if (!canonicalSuffixes.has(suffix)) {
              expected.add(suffix);
            }
          }
        }
        expect(new Set(supersededNodeSuffixes(versions))).toEqual(expected);
      }),
      { numRuns: propertyRunCount },
    );
  });

  it("never reports a canonical suffix as superseded", () => {
    fc.assert(
      fc.property(NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(), (versions) => {
        const canonicalSuffixes = new Set(canonicalNamingSchemaVersion(versions).nodeSuffixes);
        for (const suffix of supersededNodeSuffixes(versions)) {
          expect(canonicalSuffixes.has(suffix)).toBe(false);
        }
      }),
      { numRuns: propertyRunCount },
    );
  });
});

describe("naming-schema version self-containment", () => {
  it("carries its own accepted filename forms on each version", () => {
    fc.assert(
      fc.property(NAMING_SCHEMA_VERSION_TEST_GENERATOR.version(), (version) => {
        expect(Array.isArray(version.nodeSuffixes)).toBe(true);
        expect(Array.isArray(version.decisionSuffixes)).toBe(true);
        expect(version.productSuffix.length).toBeGreaterThan(0);
        expect(Array.isArray(version.runners)).toBe(true);
        expect(version.evidence).toBeDefined();
        expect(version.order).toBeDefined();
        expect(Array.isArray(version.coordinationNotes)).toBe(true);
        expect(Array.isArray(version.evalLane)).toBe(true);
        expect(version.specFileSuffix.length).toBeGreaterThan(0);
      }),
      { numRuns: propertyRunCount },
    );
  });
});
