import * as fc from "fast-check";

import { type NamingSchemaVersion, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import { DECISION_SUFFIXES, NODE_SUFFIXES } from "@/lib/spec-tree/config";

const NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS = {
  VERSION_COMPONENT_MAX: 25,
  SUFFIX_REST_MAX_LENGTH: 9,
  NODE_SUFFIX_SET_MIN: 1,
  NODE_SUFFIX_SET_MAX: 4,
  DECISION_SUFFIX_SET_MIN: 1,
  DECISION_SUFFIX_SET_MAX: 3,
  VERSION_TUPLE_MIN: 2,
  VERSION_TUPLE_MAX: 5,
  PROPERTY_RUN_COUNT: 50,
  RECOGNITION_FOREIGN_SUFFIX_COUNT: 2,
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

export const NAMING_SCHEMA_VERSION_TEST_GENERATOR = {
  counts: {
    propertyRunCount: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.PROPERTY_RUN_COUNT,
  },
  version: arbitraryNamingSchemaVersion,
  versionTuple: arbitraryNamingSchemaVersionTuple,
  recognitionScenario: arbitraryRecognitionVersionScenario,
  demotedRegistrySuffixScenario: arbitraryDemotedRegistrySuffixScenario,
  canonicalForeignSuffixScenario: arbitraryCanonicalForeignSuffixScenario,
} as const;

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
): NamingSchemaVersion {
  return {
    version,
    nodeSuffixes,
    decisionSuffixes,
    productSuffix: SPEC_TREE_GRAMMAR.PRODUCT_SUFFIX,
    evidence: SPEC_TREE_GRAMMAR.EVIDENCE,
    runners: SPEC_TREE_GRAMMAR.RUNNERS,
    order: SPEC_TREE_GRAMMAR.ORDER,
    pathSeparator: SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
    coordinationNotes: SPEC_TREE_GRAMMAR.COORDINATION_NOTES,
    evalLane: SPEC_TREE_GRAMMAR.EVAL_LANE,
  };
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
    })
    .map(({ version, nodeSuffixes, decisionSuffixes }) =>
      buildNamingSchemaVersion(version, nodeSuffixes, decisionSuffixes)
    );
}

function arbitraryNamingSchemaVersionTuple(): fc.Arbitrary<readonly NamingSchemaVersion[]> {
  return fc
    .uniqueArray(arbitrarySemver(), {
      minLength: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.VERSION_TUPLE_MIN,
      maxLength: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.VERSION_TUPLE_MAX,
    })
    .chain((versions) =>
      fc.tuple(
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
            .map(({ nodeSuffixes, decisionSuffixes }) =>
              buildNamingSchemaVersion(version, nodeSuffixes, decisionSuffixes)
            )
        ),
      )
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
      if (supersededNodeSuffix === undefined || invalidNodeSuffix === undefined) {
        throw new Error("Recognition scenario requires two distinct foreign node suffixes");
      }
      return {
        schemaVersions: [
          buildNamingSchemaVersion(RECOGNITION_SCENARIO_VERSION.PRIOR, [supersededNodeSuffix], DECISION_SUFFIXES),
          buildNamingSchemaVersion(RECOGNITION_SCENARIO_VERSION.CANONICAL, NODE_SUFFIXES, DECISION_SUFFIXES),
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
      if (foreignCanonicalSuffix === undefined || foreignPriorSuffix === undefined) {
        throw new Error("Canonical-foreign-suffix scenario requires two distinct foreign node suffixes");
      }
      return {
        schemaVersions: [
          buildNamingSchemaVersion(RECOGNITION_SCENARIO_VERSION.PRIOR, [foreignPriorSuffix], DECISION_SUFFIXES),
          buildNamingSchemaVersion(RECOGNITION_SCENARIO_VERSION.CANONICAL, [foreignCanonicalSuffix], DECISION_SUFFIXES),
        ],
        foreignCanonicalSuffix,
      };
    });
}

function arbitraryDemotedRegistrySuffixScenario(): fc.Arbitrary<DemotedRegistrySuffixScenario> {
  return fc.integer({ min: 0, max: NODE_SUFFIXES.length - 1 }).map((demotedIndex) => {
    const demotedRegistrySuffix = NODE_SUFFIXES[demotedIndex];
    const canonicalRegistrySuffixes = NODE_SUFFIXES.filter((_, index) => index !== demotedIndex);
    const canonicalRegistrySuffix = canonicalRegistrySuffixes[0];
    if (demotedRegistrySuffix === undefined || canonicalRegistrySuffix === undefined) {
      throw new Error("Demoted-registry-suffix scenario requires at least two registry node suffixes");
    }
    return {
      schemaVersions: [
        buildNamingSchemaVersion(RECOGNITION_SCENARIO_VERSION.PRIOR, [demotedRegistrySuffix], DECISION_SUFFIXES),
        buildNamingSchemaVersion(RECOGNITION_SCENARIO_VERSION.CANONICAL, canonicalRegistrySuffixes, DECISION_SUFFIXES),
      ],
      demotedRegistrySuffix,
      demotedVersion: RECOGNITION_SCENARIO_VERSION.PRIOR,
      canonicalRegistrySuffix,
    };
  });
}
