import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  canonicalNamingSchemaVersion,
  compareNamingSchemaVersions,
  recognizeSpecTreeFilesystemEntry,
  selectSpecTreeGrammar,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
  supersededNodeSuffixes,
} from "@/lib/spec-tree";
import {
  arbitraryKnownNodeSuffix,
  arbitraryMethodologyDeclaration,
  majorComponent,
} from "@testing/generators/spec-tree/grammar-selection";
import {
  NAMING_SCHEMA_VERSION_TEST_GENERATOR,
  semverMaximumOracle,
  semverOrderOracle,
} from "@testing/generators/spec-tree/naming-schema-version";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("naming-schema version ordering", () => {
  it("orders versions exactly as the semantic-version oracle does", () => {
    assertProperty(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionComparisonPair(),
      ([left, right]) => {
        expect(Math.sign(compareNamingSchemaVersions(left, right))).toBe(
          Math.sign(semverOrderOracle(left.version, right.version)),
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("selects the canonical version as the semantic-version maximum of the tuple", () => {
    assertProperty(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(),
      (versions) => {
        expect(canonicalNamingSchemaVersion(versions).version).toBe(semverMaximumOracle(versions).version);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("selects the canonical version as a member of the tuple", () => {
    assertProperty(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(),
      (versions) => {
        expect(versions).toContain(canonicalNamingSchemaVersion(versions));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a non-numeric version identifier rather than mis-ordering it", () => {
    assertProperty(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.nonNumericVersionPair(),
      ({ invalid, valid }) => {
        expect(() => compareNamingSchemaVersions(invalid, valid)).toThrow();
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});

describe("naming-schema superseded derivation", () => {
  it("derives the superseded node suffixes as the prior versions' suffixes less the canonical set", () => {
    assertProperty(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(),
      (versions) => {
        const maximum = semverMaximumOracle(versions);
        const expected = new Set(
          versions
            .filter((version) => semverOrderOracle(version.version, maximum.version) < 0)
            .flatMap((version) => version.nodeSuffixes)
            .filter((suffix) => !maximum.nodeSuffixes.includes(suffix)),
        );

        expect(new Set(supersededNodeSuffixes(versions))).toEqual(expected);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("never reports a canonical suffix as superseded", () => {
    assertProperty(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(),
      (versions) => {
        const maximum = semverMaximumOracle(versions);
        for (const suffix of supersededNodeSuffixes(versions)) {
          expect(maximum.nodeSuffixes.includes(suffix)).toBe(false);
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});

describe("naming-schema version self-containment", () => {
  it("carries its own accepted filename forms on each shipped version", () => {
    for (const version of SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS) {
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
  });

  it("classifies a node directory as a node exactly when the selected version's own suffixes include its suffix, whatever other versions are known", () => {
    assertProperty(
      fc.tuple(
        NAMING_SCHEMA_VERSION_TEST_GENERATOR.selectedVersionScenario(),
        SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
        SPEC_TREE_TEST_GENERATOR.sourceSlug(),
      ),
      ([{ selected, companions, suffix }, order, slug]) => {
        const record = {
          type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
          relativePath: `${order}-${slug}${suffix}`,
        };
        const alone = recognizeSpecTreeFilesystemEntry(record, {
          schemaVersions: [selected],
          selectedVersions: [selected],
        });
        const amongOthers = recognizeSpecTreeFilesystemEntry(record, {
          schemaVersions: [selected, ...companions],
          selectedVersions: [selected],
        });

        expect(alone?.type === SPEC_TREE_ENTRY_TYPE.NODE).toBe(selected.nodeSuffixes.includes(suffix));
        expect(amongOthers?.type === SPEC_TREE_ENTRY_TYPE.NODE).toBe(selected.nodeSuffixes.includes(suffix));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});

describe("naming-schema declaration selection", () => {
  it("selects exactly the known versions whose major serves a declared line", () => {
    assertProperty(
      arbitraryMethodologyDeclaration(),
      (declaration) => {
        const declaredMajors = [declaration.version, declaration.migratingFrom]
          .filter((declared): declared is string => declared !== undefined)
          .map((declared) => majorComponent(declared));
        const selection = selectSpecTreeGrammar(declaration);

        expect(new Set(selection.selected.map(({ version }) => version))).toEqual(
          new Set(
            SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS
              .map(({ version }) => version)
              .filter((version) => declaredMajors.includes(majorComponent(version))),
          ),
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});

describe("naming-schema supersession against the declared target", () => {
  it("classifies a node directory as a node when a valid version accepts it, superseded when only an earlier version does, and invalid otherwise", () => {
    assertProperty(
      fc.tuple(
        arbitraryMethodologyDeclaration(),
        SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
        SPEC_TREE_TEST_GENERATOR.sourceSlug(),
        arbitraryKnownNodeSuffix(),
      ),
      ([declaration, order, slug, suffix]) => {
        const selection = selectSpecTreeGrammar(declaration);
        const targetMajor = Math.max(...selection.selected.map(({ version }) => Number(majorComponent(version))));
        const acceptedByValid = selection.selected.some(({ nodeSuffixes }) => nodeSuffixes.includes(suffix));
        const acceptedByEarlier = selection.known.some(
          ({ version, nodeSuffixes }) => Number(majorComponent(version)) < targetMajor && nodeSuffixes.includes(suffix),
        );

        const entry = recognizeSpecTreeFilesystemEntry(
          {
            type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
            relativePath: `${order}-${slug}${suffix}`,
          },
          { schemaVersions: selection.known, selectedVersions: selection.selected },
        );

        expect(entry?.type === SPEC_TREE_ENTRY_TYPE.NODE).toBe(acceptedByValid);
        expect(entry?.type === SPEC_TREE_ENTRY_TYPE.SUPERSEDED).toBe(!acceptedByValid && acceptedByEarlier);
        expect(entry?.type === SPEC_TREE_ENTRY_TYPE.INVALID).toBe(!acceptedByValid && !acceptedByEarlier);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
