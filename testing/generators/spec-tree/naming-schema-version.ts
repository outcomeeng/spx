import * as fc from "fast-check";

import {
  canonicalNamingSchemaVersion,
  compareNumericVersionIdentifiers,
  DECISION_SUFFIXES,
  type NamingSchemaVersion,
  NODE_SUFFIXES,
  SPEC_TREE_GRAMMAR,
  type SpecTreeEvidenceGrammar,
} from "@/lib/spec-tree";

const NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS = {
  VERSION_COMPONENT_MAX: 25,
  SUFFIX_REST_MAX_LENGTH: 9,
  NODE_SUFFIX_SET_MIN: 1,
  NODE_SUFFIX_SET_MAX: 4,
  DECISION_SUFFIX_SET_MIN: 1,
  DECISION_SUFFIX_SET_MAX: 3,
  VERSION_TUPLE_MIN: 2,
  VERSION_TUPLE_MAX: 5,
  RECOGNITION_FOREIGN_SUFFIX_COUNT: 2,
  EVIDENCE_TOKEN_MAX_LENGTH: 10,
} as const;

// Fixture-scoped version identifiers, deliberately distinct from the production
// NAMING_SCHEMA_VERSION_ID — the recognizer is generic over any version tuple, so
// scenarios prove classification against arbitrary identifiers, not the owned ones.
const RECOGNITION_SCENARIO_VERSION = {
  PRIOR: "0.1.0",
  CANONICAL: "0.2.0",
} as const;

const SEMVER_COMPONENT_SEPARATOR = ".";
const SUFFIX_LEAD = ".";
const SUFFIX_INITIAL_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyz"];
const SUFFIX_REST_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyz-"];
const SEMVER_COMPONENT_COUNT = 3;

export type RecognitionVersionScenario = {
  readonly schemaVersions: readonly NamingSchemaVersion[];
  readonly validNodeSuffix: string;
  readonly supersededNodeSuffix: string;
  readonly supersededVersion: string;
  readonly invalidNodeSuffix: string;
};

export type DemotedRegistrySuffixScenario = {
  readonly schemaVersions: readonly NamingSchemaVersion[];
  readonly demotedRegistrySuffix: string;
  readonly demotedVersion: string;
  readonly canonicalRegistrySuffix: string;
};

export type CanonicalForeignSuffixScenario = {
  readonly schemaVersions: readonly NamingSchemaVersion[];
  readonly foreignCanonicalSuffix: string;
};

export type InjectedEvidenceGrammarScenario = {
  readonly schemaVersions: readonly NamingSchemaVersion[];
  readonly relativePath: string;
};

export type NonNumericVersionPair = {
  readonly invalid: NamingSchemaVersion;
  readonly valid: NamingSchemaVersion;
};

export const NAMING_SCHEMA_VERSION_TEST_GENERATOR = {
  version: arbitraryNamingSchemaVersion,
  versionComparisonPair: arbitraryNamingSchemaVersionComparisonPair,
  nonNumericVersionPair: arbitraryNonNumericVersionPair,
  versionTuple: arbitraryNamingSchemaVersionTuple,
  recognitionScenario: arbitraryRecognitionVersionScenario,
  demotedRegistrySuffixScenario: arbitraryDemotedRegistrySuffixScenario,
  canonicalForeignSuffixScenario: arbitraryCanonicalForeignSuffixScenario,
  injectedEvidenceGrammarScenario: arbitraryInjectedEvidenceGrammarScenario,
} as const;

function arbitraryNamingSchemaVersionComparisonPair(): fc.Arbitrary<
  readonly [NamingSchemaVersion, NamingSchemaVersion]
> {
  return fc.tuple(arbitraryNamingSchemaVersion(), arbitraryNamingSchemaVersion());
}

function arbitraryNonNumericVersionPair(): fc.Arbitrary<NonNumericVersionPair> {
  return arbitraryNamingSchemaVersion().map((valid) => ({
    invalid: { ...valid, version: `${valid.version}-alpha` },
    valid,
  }));
}

function arbitrarySemver(): fc.Arbitrary<string> {
  return fc
    .array(fc.nat({ max: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.VERSION_COMPONENT_MAX }), {
      minLength: SEMVER_COMPONENT_COUNT,
      maxLength: SEMVER_COMPONENT_COUNT,
    })
    .map((components) => components.join(SEMVER_COMPONENT_SEPARATOR));
}

function arbitrarySuffix(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom(...SUFFIX_INITIAL_CHARACTERS),
      fc.string({
        unit: fc.constantFrom(...SUFFIX_REST_CHARACTERS),
        minLength: 0,
        maxLength: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.SUFFIX_REST_MAX_LENGTH,
      }),
    )
    .map(([initial, rest]) => `${SUFFIX_LEAD}${initial}${rest}`);
}

function arbitrarySuffixSet(minLength: number, maxLength: number): fc.Arbitrary<readonly string[]> {
  return fc.uniqueArray(arbitrarySuffix(), { minLength, maxLength });
}

function buildNamingSchemaVersion(
  version: string,
  nodeSuffixes: readonly string[],
  decisionSuffixes: readonly string[],
  specFileSuffix: string,
  evidence: SpecTreeEvidenceGrammar = SPEC_TREE_GRAMMAR.EVIDENCE,
): NamingSchemaVersion {
  return {
    version,
    nodeSuffixes,
    decisionSuffixes,
    productSuffix: SPEC_TREE_GRAMMAR.PRODUCT_SUFFIX,
    evidence,
    runners: SPEC_TREE_GRAMMAR.RUNNERS,
    order: SPEC_TREE_GRAMMAR.ORDER,
    pathSeparator: SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
    coordinationNotes: SPEC_TREE_GRAMMAR.COORDINATION_NOTES,
    eval: SPEC_TREE_GRAMMAR.EVAL,
    specFileSuffix,
  };
}

function arbitraryEvidenceToken(): fc.Arbitrary<string> {
  return fc.string({
    unit: fc.constantFrom(...SUFFIX_REST_CHARACTERS),
    minLength: 1,
    maxLength: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.EVIDENCE_TOKEN_MAX_LENGTH,
  });
}

function arbitraryInjectedEvidenceGrammarScenario(): fc.Arbitrary<InjectedEvidenceGrammarScenario> {
  return fc
    .tuple(
      arbitraryRecognitionVersionScenario(),
      arbitraryEvidenceToken(),
      arbitraryEvidenceToken(),
      arbitraryEvidenceToken(),
      arbitraryEvidenceToken(),
      arbitraryEvidenceToken(),
    )
    .map(([scenario, directoryName, subject, mode, level, tail]) => {
      const evidence: SpecTreeEvidenceGrammar = {
        DIRECTORY_NAME: directoryName,
        MODES: [mode],
        LEVELS: [level],
        TAILS: { INJECTED: [tail] },
        SEGMENT_SEPARATOR: SPEC_TREE_GRAMMAR.EVIDENCE.SEGMENT_SEPARATOR,
      };
      return {
        schemaVersions: scenario.schemaVersions.map((version) => ({ ...version, evidence })),
        relativePath: [
          directoryName,
          [subject, mode, level, tail].join(evidence.SEGMENT_SEPARATOR),
        ].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
      };
    });
}

// The canonical (highest-version) member carries the spec document-kind suffix;
// every prior member carries the bare suffix, mirroring the production model so a
// generated tuple is a faithful naming-schema history rather than a uniform corpus.
function specFileSuffixForRole(isCanonical: boolean): string {
  return isCanonical ? SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX : SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX;
}

function arbitraryNamingSchemaVersion(): fc.Arbitrary<NamingSchemaVersion> {
  return fc
    .record({
      version: arbitrarySemver(),
      nodeSuffixes: arbitrarySuffixSet(
        NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.NODE_SUFFIX_SET_MIN,
        NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.NODE_SUFFIX_SET_MAX,
      ),
      decisionSuffixes: arbitrarySuffixSet(
        NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.DECISION_SUFFIX_SET_MIN,
        NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.DECISION_SUFFIX_SET_MAX,
      ),
      specFileSuffix: fc.constantFrom(
        SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX,
        SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX,
      ),
    })
    .map(({ version, nodeSuffixes, decisionSuffixes, specFileSuffix }) =>
      buildNamingSchemaVersion(version, nodeSuffixes, decisionSuffixes, specFileSuffix)
    );
}

function arbitraryNamingSchemaVersionTuple(): fc.Arbitrary<readonly NamingSchemaVersion[]> {
  return fc
    .uniqueArray(arbitrarySemver(), {
      minLength: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.VERSION_TUPLE_MIN,
      maxLength: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.VERSION_TUPLE_MAX,
    })
    .chain((versions) =>
      fc
        .tuple(
          ...versions.map((version) =>
            fc
              .record({
                nodeSuffixes: arbitrarySuffixSet(
                  NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.NODE_SUFFIX_SET_MIN,
                  NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.NODE_SUFFIX_SET_MAX,
                ),
                decisionSuffixes: arbitrarySuffixSet(
                  NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.DECISION_SUFFIX_SET_MIN,
                  NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.DECISION_SUFFIX_SET_MAX,
                ),
              })
              .map(({ nodeSuffixes, decisionSuffixes }) => ({ version, nodeSuffixes, decisionSuffixes }))
          ),
        )
        .map((members) => {
          // Determine the canonical member with the production comparator rather than a
          // local copy, so the generator cannot drift from the ordering it generates for.
          const canonicalVersion = canonicalNamingSchemaVersion(
            members.map((member) =>
              buildNamingSchemaVersion(
                member.version,
                member.nodeSuffixes,
                member.decisionSuffixes,
                SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX,
              )
            ),
          ).version;
          return members.map((member) =>
            buildNamingSchemaVersion(
              member.version,
              member.nodeSuffixes,
              member.decisionSuffixes,
              specFileSuffixForRole(member.version === canonicalVersion),
            )
          );
        })
    );
}

function arbitraryForeignNodeSuffix(): fc.Arbitrary<string> {
  const canonicalSuffixes = new Set(NODE_SUFFIXES);
  return arbitrarySuffix().filter((suffix) => !canonicalSuffixes.has(suffix));
}

function arbitraryRecognitionVersionScenario(): fc.Arbitrary<RecognitionVersionScenario> {
  return fc
    .record({
      validNodeSuffix: fc.constantFrom(...NODE_SUFFIXES),
      foreignSuffixes: fc.uniqueArray(arbitraryForeignNodeSuffix(), {
        minLength: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.RECOGNITION_FOREIGN_SUFFIX_COUNT,
        maxLength: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.RECOGNITION_FOREIGN_SUFFIX_COUNT,
      }),
    })
    .map(({ validNodeSuffix, foreignSuffixes }) => {
      const supersededNodeSuffix = foreignSuffixes[0];
      const invalidNodeSuffix = foreignSuffixes[1];
      return {
        schemaVersions: [
          buildNamingSchemaVersion(
            RECOGNITION_SCENARIO_VERSION.PRIOR,
            [supersededNodeSuffix],
            DECISION_SUFFIXES,
            specFileSuffixForRole(false),
          ),
          buildNamingSchemaVersion(
            RECOGNITION_SCENARIO_VERSION.CANONICAL,
            NODE_SUFFIXES,
            DECISION_SUFFIXES,
            specFileSuffixForRole(true),
          ),
        ],
        validNodeSuffix,
        supersededNodeSuffix,
        supersededVersion: RECOGNITION_SCENARIO_VERSION.PRIOR,
        invalidNodeSuffix,
      };
    });
}

function arbitraryCanonicalForeignSuffixScenario(): fc.Arbitrary<CanonicalForeignSuffixScenario> {
  return fc
    .uniqueArray(arbitraryForeignNodeSuffix(), {
      minLength: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.RECOGNITION_FOREIGN_SUFFIX_COUNT,
      maxLength: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.RECOGNITION_FOREIGN_SUFFIX_COUNT,
    })
    .map((foreignSuffixes) => {
      const foreignCanonicalSuffix = foreignSuffixes[0];
      const foreignPriorSuffix = foreignSuffixes[1];
      return {
        schemaVersions: [
          buildNamingSchemaVersion(
            RECOGNITION_SCENARIO_VERSION.PRIOR,
            [foreignPriorSuffix],
            DECISION_SUFFIXES,
            specFileSuffixForRole(false),
          ),
          buildNamingSchemaVersion(
            RECOGNITION_SCENARIO_VERSION.CANONICAL,
            [foreignCanonicalSuffix],
            DECISION_SUFFIXES,
            specFileSuffixForRole(true),
          ),
        ],
        foreignCanonicalSuffix,
      };
    });
}

function arbitraryDemotedRegistrySuffixScenario(): fc.Arbitrary<DemotedRegistrySuffixScenario> {
  return fc
    .tuple(
      fc.integer({ min: 0, max: NODE_SUFFIXES.length - 1 }),
      arbitrarySemver(),
      arbitrarySemver(),
    )
    .filter(([, leftVersion, rightVersion]) => compareNumericVersionIdentifiers(leftVersion, rightVersion) !== 0)
    .map(([demotedIndex, leftVersion, rightVersion]) => {
      const demotedRegistrySuffix = NODE_SUFFIXES[demotedIndex];
      const canonicalRegistrySuffixes = NODE_SUFFIXES.filter((_, index) => index !== demotedIndex);
      const canonicalRegistrySuffix = canonicalRegistrySuffixes[0];
      const priorVersion = compareNumericVersionIdentifiers(leftVersion, rightVersion) < 0 ? leftVersion : rightVersion;
      const canonicalVersion = priorVersion === leftVersion ? rightVersion : leftVersion;
      return {
        schemaVersions: [
          buildNamingSchemaVersion(
            priorVersion,
            [demotedRegistrySuffix],
            DECISION_SUFFIXES,
            specFileSuffixForRole(false),
          ),
          buildNamingSchemaVersion(
            canonicalVersion,
            canonicalRegistrySuffixes,
            DECISION_SUFFIXES,
            specFileSuffixForRole(true),
          ),
        ],
        demotedRegistrySuffix,
        demotedVersion: priorVersion,
        canonicalRegistrySuffix,
      };
    });
}
