import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
} from "@/lib/spec-tree";
import { NAMING_SCHEMA_VERSION_TEST_GENERATOR } from "@testing/generators/spec-tree/naming-schema-version";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { expectPresent } from "@testing/harnesses/spec-tree/assertions";

const propertyRunCount = NAMING_SCHEMA_VERSION_TEST_GENERATOR.counts.propertyRunCount;

function directoryRecord(order: number, slug: string, suffix: string) {
  return {
    type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
    relativePath: `${order}-${slug}${suffix}`,
  };
}

describe("version classification", () => {
  it("maps a name matching the canonical version to a valid entry of its kind", () => {
    fc.assert(
      fc.property(
        NAMING_SCHEMA_VERSION_TEST_GENERATOR.recognitionScenario(),
        SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
        SPEC_TREE_TEST_GENERATOR.sourceSlug(),
        (scenario, order, slug) => {
          const entry = expectPresent(
            recognizeSpecTreeFilesystemEntry(directoryRecord(order, slug, scenario.validNodeSuffix), {
              schemaVersions: scenario.schemaVersions,
            }),
          );
          expect(entry.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
        },
      ),
      { numRuns: propertyRunCount },
    );
  });

  it("maps a name matching a prior version to a superseded entry naming the matched version", () => {
    fc.assert(
      fc.property(
        NAMING_SCHEMA_VERSION_TEST_GENERATOR.recognitionScenario(),
        SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
        SPEC_TREE_TEST_GENERATOR.sourceSlug(),
        (scenario, order, slug) => {
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
      ),
      { numRuns: propertyRunCount },
    );
  });

  it("maps a name matching no version to an invalid entry", () => {
    fc.assert(
      fc.property(
        NAMING_SCHEMA_VERSION_TEST_GENERATOR.recognitionScenario(),
        SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
        SPEC_TREE_TEST_GENERATOR.sourceSlug(),
        (scenario, order, slug) => {
          const entry = expectPresent(
            recognizeSpecTreeFilesystemEntry(directoryRecord(order, slug, scenario.invalidNodeSuffix), {
              schemaVersions: scenario.schemaVersions,
            }),
          );
          expect(entry.type).toBe(SPEC_TREE_ENTRY_TYPE.INVALID);
        },
      ),
      { numRuns: propertyRunCount },
    );
  });

  it("gates validity on the injected canonical version, not the live kind registry", () => {
    fc.assert(
      fc.property(
        NAMING_SCHEMA_VERSION_TEST_GENERATOR.demotedRegistrySuffixScenario(),
        SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
        SPEC_TREE_TEST_GENERATOR.sourceSlug(),
        (scenario, order, slug) => {
          // A registry-live suffix the injected canonical demotes to a prior version
          // must classify superseded, not valid — classification follows the injected set.
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
      ),
      { numRuns: propertyRunCount },
    );
  });

  it("classifies a canonical-accepted suffix with no backing registry kind as invalid", () => {
    fc.assert(
      fc.property(
        NAMING_SCHEMA_VERSION_TEST_GENERATOR.canonicalForeignSuffixScenario(),
        SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
        SPEC_TREE_TEST_GENERATOR.sourceSlug(),
        (scenario, order, slug) => {
          // The injected canonical accepts the suffix, but no registry kind backs it,
          // so it cannot form a typed node and classifies invalid rather than valid.
          const entry = expectPresent(
            recognizeSpecTreeFilesystemEntry(directoryRecord(order, slug, scenario.foreignCanonicalSuffix), {
              schemaVersions: scenario.schemaVersions,
            }),
          );
          expect(entry.type).toBe(SPEC_TREE_ENTRY_TYPE.INVALID);
        },
      ),
      { numRuns: propertyRunCount },
    );
  });
});
