import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  canonicalNamingSchemaVersion,
  compareNamingSchemaVersions,
  recognizeSpecTreeFilesystemEntry,
  selectSpecTreeGrammar,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
  supersededNodeSuffixes,
} from "@/lib/spec-tree";
import {
  arbitraryKnownNodeSuffix,
  arbitraryMethodologyDeclaration,
  majorComponent,
} from "@testing/generators/spec-tree/grammar-selection";
import {
  NAMING_SCHEMA_VERSION_TEST_GENERATOR,
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
        const oracleMaximum = versions.reduce((maximum, version) =>
          semverOrderOracle(version.version, maximum.version) > 0 ? version : maximum
        );

        expect(canonicalNamingSchemaVersion(versions).version).toBe(oracleMaximum.version);
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
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("never reports a canonical suffix as superseded", () => {
    assertProperty(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.versionTuple(),
      (versions) => {
        const canonicalSuffixes = new Set(canonicalNamingSchemaVersion(versions).nodeSuffixes);
        for (const suffix of supersededNodeSuffixes(versions)) {
          expect(canonicalSuffixes.has(suffix)).toBe(false);
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});

describe("naming-schema version self-containment", () => {
  it("carries its own accepted filename forms on each version", () => {
    const carriesAllFilenameForms = (version: (typeof SPEC_TREE_NAMING_SCHEMA_VERSIONS)[number]) => {
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
    };

    for (const version of SPEC_TREE_NAMING_SCHEMA_VERSIONS) carriesAllFilenameForms(version);
    assertProperty(NAMING_SCHEMA_VERSION_TEST_GENERATOR.version(), carriesAllFilenameForms, {
      level: PROPERTY_LEVEL.L1,
    });
  });
});

describe("naming-schema spec-file form by role", () => {
  it("assigns the canonical suffix to exactly the canonical member and the bare suffix to every prior member", () => {
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
