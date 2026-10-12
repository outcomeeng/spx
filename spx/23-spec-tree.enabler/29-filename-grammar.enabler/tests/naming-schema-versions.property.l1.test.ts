import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  recognizeSpecTreeFilesystemEntry,
  selectSpecTreeGrammar,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
} from "@/lib/spec-tree";
import {
  arbitraryKnownNodeSuffix,
  arbitraryMethodologyDeclaration,
  majorComponent,
} from "@testing/generators/spec-tree/grammar-selection";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  assertCanonicalNamingSchemaVersionBelongsToTuple,
  assertCanonicalNamingSchemaVersionIsSemanticMaximum,
  assertCanonicalSuffixesAreNeverSuperseded,
  assertNamingSchemaSpecFileSuffixMatchesVersionRole,
  assertNamingSchemaVersionsCarryAllFilenameForms,
  assertNamingSchemaVersionsFollowSemanticOrder,
  assertNonNumericNamingSchemaVersionIsRejected,
  assertSupersededSuffixesComeFromPriorVersions,
} from "@testing/harnesses/spec-tree/naming-schema-version";

describe("naming-schema version ordering", () => {
  it("orders versions exactly as the semantic-version oracle does", () => {
    assertNamingSchemaVersionsFollowSemanticOrder();
  });

  it("selects the canonical version as the semantic-version maximum of the tuple", () => {
    assertCanonicalNamingSchemaVersionIsSemanticMaximum();
  });

  it("selects the canonical version as a member of the tuple", () => {
    assertCanonicalNamingSchemaVersionBelongsToTuple();
  });

  it("rejects a non-numeric version identifier rather than mis-ordering it", () => {
    assertNonNumericNamingSchemaVersionIsRejected();
  });
});

describe("naming-schema superseded derivation", () => {
  it("derives the superseded node suffixes as the prior versions' suffixes less the canonical set", () => {
    assertSupersededSuffixesComeFromPriorVersions();
  });

  it("never reports a canonical suffix as superseded", () => {
    assertCanonicalSuffixesAreNeverSuperseded();
  });
});

describe("naming-schema version self-containment", () => {
  it("carries its own accepted filename forms on each version", () => {
    assertNamingSchemaVersionsCarryAllFilenameForms();
  });
});

describe("naming-schema spec-file form by role", () => {
  it("assigns the canonical suffix to exactly the canonical member and the bare suffix to every prior member", () => {
    assertNamingSchemaSpecFileSuffixMatchesVersionRole();
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
