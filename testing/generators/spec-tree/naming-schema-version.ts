import * as fc from "fast-check";

import { type NamingSchemaVersion, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";

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
} as const;

const SEMVER_COMPONENT_SEPARATOR = ".";
const SUFFIX_LEAD = ".";
const SUFFIX_INITIAL_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyz"];
const SUFFIX_REST_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyz-"];
const SEMVER_COMPONENT_COUNT = 3;

export const NAMING_SCHEMA_VERSION_TEST_GENERATOR = {
  counts: {
    propertyRunCount: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.PROPERTY_RUN_COUNT,
  },
  version: arbitraryNamingSchemaVersion,
  versionTuple: arbitraryNamingSchemaVersionTuple,
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
