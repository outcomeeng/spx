import * as fc from "fast-check";

import {
  DECISION_SUFFIXES,
  type NamingSchemaVersion,
  NODE_SUFFIXES,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_METHODOLOGY_LINE,
  type SpecTreeEvidenceGrammar,
  type SpecTreeFilesystemRecordType,
  type SpecTreeMethodologyLine,
} from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";

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
  SUPERSEDED_PRIOR_MIN: 2,
  SUPERSEDED_PRIOR_MAX: 3,
  SUPERSEDED_NON_PRIOR_COUNT: 2,
  SUPERSEDED_TARGET_SUFFIX_COUNT: 2,
  COMPANION_VERSION_MIN: 1,
  COMPANION_VERSION_MAX: 3,
} as const;

const SEMVER_COMPONENT_SEPARATOR = ".";
const SUFFIX_LEAD = ".";
const SUFFIX_INITIAL_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyz"];
const SUFFIX_REST_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyz-"];
const SEMVER_COMPONENT_COUNT = 3;
const INJECTED_WORD_SEPARATOR = "_";
const INJECTED_WORD_PATTERN = /^[a-z-]+$/;

export type DemotedRegistrySuffixScenario = {
  readonly schemaVersions: readonly NamingSchemaVersion[];
  /** The members of `schemaVersions` the scenario's methodology declaration selects. */
  readonly selectedVersions: readonly NamingSchemaVersion[];
  readonly demotedRegistrySuffix: string;
  readonly demotedVersion: string;
  readonly canonicalRegistrySuffix: string;
};

export type CanonicalForeignSuffixScenario = {
  readonly schemaVersions: readonly NamingSchemaVersion[];
  /** The members of `schemaVersions` the scenario's methodology declaration selects. */
  readonly selectedVersions: readonly NamingSchemaVersion[];
  readonly foreignCanonicalSuffix: string;
};

export type InjectedEvidenceGrammarScenario = {
  readonly schemaVersions: readonly NamingSchemaVersion[];
  /** The members of `schemaVersions` the scenario's methodology declaration selects. */
  readonly selectedVersions: readonly NamingSchemaVersion[];
  readonly relativePath: string;
};

/**
 * One selected version carrying injected evidence tokens beside a known companion, with a file named by
 * those injected tokens and a file named by the production grammar's tokens.
 */
export type EvidenceSelfContainmentScenario = {
  readonly schemaVersions: readonly NamingSchemaVersion[];
  readonly selectedVersions: readonly NamingSchemaVersion[];
  readonly parentId: string;
  /** A file named by the selected version's own evidence tokens. */
  readonly ownRelativePath: string;
  /** A file named by the production grammar's evidence tokens, which the selected version does not carry. */
  readonly foreignRelativePath: string;
};

export type SelectedVersionScenario = {
  readonly selected: NamingSchemaVersion;
  readonly companions: readonly NamingSchemaVersion[];
  readonly suffix: string;
};

export type NonNumericVersionPair = {
  readonly invalid: NamingSchemaVersion;
  readonly valid: NamingSchemaVersion;
};

// Independent ordering oracle: compares dotted numeric components position by position,
// padding the shorter identifier with zeros, without reusing the production comparator.
export function semverOrderOracle(left: string, right: string): number {
  const leftComponents = left.split(SEMVER_COMPONENT_SEPARATOR).map((part) => Number(part));
  const rightComponents = right.split(SEMVER_COMPONENT_SEPARATOR).map((part) => Number(part));
  const length = Math.max(leftComponents.length, rightComponents.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftComponents[index] ?? 0) - (rightComponents[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Independent maximum oracle: the member the semantic-version oracle orders last, taking the earliest on a tie. */
export function semverMaximumOracle(versions: readonly NamingSchemaVersion[]): NamingSchemaVersion {
  const first = versions.at(0);
  if (first === undefined) throw new Error("Expected a non-empty naming-schema version tuple");
  return versions.slice(1).reduce(
    (maximum, version) => semverOrderOracle(version.version, maximum.version) > 0 ? version : maximum,
    first,
  );
}

export const NAMING_SCHEMA_VERSION_TEST_GENERATOR = {
  version: arbitraryNamingSchemaVersion,
  versionComparisonPair: arbitraryNamingSchemaVersionComparisonPair,
  nonNumericVersionPair: arbitraryNonNumericVersionPair,
  versionTuple: arbitraryNamingSchemaVersionTuple,
  selectedVersionScenario: arbitrarySelectedVersionScenario,
  supersededTupleScenario: arbitrarySupersededTupleScenario,
  demotedRegistrySuffixScenario: arbitraryDemotedRegistrySuffixScenario,
  canonicalForeignSuffixScenario: arbitraryCanonicalForeignSuffixScenario,
  injectedEvidenceGrammarScenario: arbitraryInjectedEvidenceGrammarScenario,
  evidenceSelfContainmentScenario: arbitraryEvidenceSelfContainmentScenario,
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
  lines: readonly SpecTreeMethodologyLine[] = [],
): NamingSchemaVersion {
  return {
    version,
    lines,
    nodeSuffixes,
    decisionSuffixes,
    productSuffix: SPEC_TREE_GRAMMAR.PRODUCT_SUFFIX,
    evidence,
    runners: SPEC_TREE_GRAMMAR.RUNNERS,
    order: SPEC_TREE_GRAMMAR.ORDER_FORMS.DIGIT_RUNS,
    pathSeparator: SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
    coordinationNotes: SPEC_TREE_GRAMMAR.COORDINATION_NOTES,
    eval: SPEC_TREE_GRAMMAR.EVAL,
    probe: SPEC_TREE_GRAMMAR.PROBE,
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
      arbitraryDistinctVersionPair(),
      arbitraryEvidenceToken(),
      arbitraryEvidenceToken(),
      arbitraryEvidenceToken(),
      arbitraryEvidenceToken(),
      arbitraryEvidenceToken(),
    )
    .map(([[priorVersion, canonicalVersion], directoryName, subject, mode, level, tail]) => {
      const evidence: SpecTreeEvidenceGrammar = {
        DIRECTORY_NAME: directoryName,
        MODES: [mode],
        LEVELS: [level],
        TAILS: { INJECTED: [tail] },
        SEGMENT_SEPARATOR: SPEC_TREE_GRAMMAR.EVIDENCE.SEGMENT_SEPARATOR,
        TEST_MARKER: SPEC_TREE_GRAMMAR.EVIDENCE.TEST_MARKER,
        AFFIX_SEPARATOR: SPEC_TREE_GRAMMAR.EVIDENCE.AFFIX_SEPARATOR,
        WORD_SEPARATOR: INJECTED_WORD_SEPARATOR,
        WORD_PATTERN: INJECTED_WORD_PATTERN,
      };
      const prior = buildNamingSchemaVersion(
        priorVersion,
        NODE_SUFFIXES,
        DECISION_SUFFIXES,
        specFileSuffixForRole(false),
        evidence,
      );
      const selected = buildNamingSchemaVersion(
        canonicalVersion,
        NODE_SUFFIXES,
        DECISION_SUFFIXES,
        specFileSuffixForRole(true),
        evidence,
      );
      return {
        schemaVersions: [prior, selected],
        selectedVersions: [selected],
        relativePath: [
          directoryName,
          [subject, mode, level, evidence.TEST_MARKER, tail].join(evidence.SEGMENT_SEPARATOR),
        ].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
      };
    });
}

function arbitraryEvidenceSelfContainmentScenario(): fc.Arbitrary<EvidenceSelfContainmentScenario> {
  const [productionTail] = Object.values(SPEC_TREE_GRAMMAR.EVIDENCE.TAILS);
  const [productionMode] = SPEC_TREE_GRAMMAR.EVIDENCE.MODES;
  const [productionLevel] = SPEC_TREE_GRAMMAR.EVIDENCE.LEVELS;
  return fc
    .tuple(arbitraryInjectedEvidenceGrammarScenario(), arbitraryEvidenceToken(), arbitraryEvidenceToken())
    .filter(([scenario]) =>
      scenario.selectedVersions.every(({ evidence }) =>
        evidence.DIRECTORY_NAME !== SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME
      )
    )
    .map(([scenario, parentId, subject]) => ({
      schemaVersions: scenario.schemaVersions,
      selectedVersions: scenario.selectedVersions,
      parentId,
      ownRelativePath: scenario.relativePath,
      foreignRelativePath: [
        SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME,
        [subject, productionMode, productionLevel, ...productionTail].join(
          SPEC_TREE_GRAMMAR.EVIDENCE.SEGMENT_SEPARATOR,
        ),
      ].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
    }));
}

/** Two distinct semantic versions ordered by the independent oracle: the older first. */
function arbitraryDistinctVersionPair(): fc.Arbitrary<readonly [string, string]> {
  return fc
    .uniqueArray(arbitrarySemver(), { minLength: 2, maxLength: 2 })
    .map(([left, right]) => semverOrderOracle(left, right) < 0 ? [left, right] : [right, left]);
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
      lines: fc.subarray(Object.values(SPEC_TREE_METHODOLOGY_LINE)),
    })
    .map(({ version, nodeSuffixes, decisionSuffixes, specFileSuffix, lines }) =>
      buildNamingSchemaVersion(
        version,
        nodeSuffixes,
        decisionSuffixes,
        specFileSuffix,
        SPEC_TREE_GRAMMAR.EVIDENCE,
        lines,
      )
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
          // Determine the canonical member with the semantic-version oracle, so the role each
          // member holds comes from the ordering law and never from the code under test.
          const canonicalVersion = semverMaximumOracle(
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

/**
 * A selected version whose node suffixes are a non-empty subset of the registered node suffixes,
 * the other versions known beside it, and a registered suffix the selected version may or may not own.
 */
function arbitrarySelectedVersionScenario(): fc.Arbitrary<SelectedVersionScenario> {
  const registeredSuffixSubset = (): fc.Arbitrary<string[]> => fc.subarray([...NODE_SUFFIXES], { minLength: 1 });
  return fc
    .record({
      selectedVersion: arbitrarySemver(),
      selectedSuffixes: registeredSuffixSubset(),
      companions: fc.array(
        fc.record({ version: arbitrarySemver(), suffixes: registeredSuffixSubset() }),
        {
          minLength: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.COMPANION_VERSION_MIN,
          maxLength: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.COMPANION_VERSION_MAX,
        },
      ),
      suffix: fc.constantFrom(...NODE_SUFFIXES),
    })
    .map(({ selectedVersion, selectedSuffixes, companions, suffix }) => ({
      selected: buildNamingSchemaVersion(
        selectedVersion,
        selectedSuffixes,
        DECISION_SUFFIXES,
        specFileSuffixForRole(true),
      ),
      companions: companions.map((companion) =>
        buildNamingSchemaVersion(
          companion.version,
          companion.suffixes,
          DECISION_SUFFIXES,
          specFileSuffixForRole(false),
        )
      ),
      suffix,
    }));
}

function arbitraryForeignNodeSuffix(): fc.Arbitrary<string> {
  const canonicalSuffixes = new Set(NODE_SUFFIXES);
  return arbitrarySuffix().filter((suffix) => !canonicalSuffixes.has(suffix));
}

function arbitraryCanonicalForeignSuffixScenario(): fc.Arbitrary<CanonicalForeignSuffixScenario> {
  return fc
    .tuple(
      fc.uniqueArray(arbitraryForeignNodeSuffix(), {
        minLength: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.RECOGNITION_FOREIGN_SUFFIX_COUNT,
        maxLength: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.RECOGNITION_FOREIGN_SUFFIX_COUNT,
      }),
      arbitraryDistinctVersionPair(),
    )
    .map(([foreignSuffixes, [priorVersion, canonicalVersion]]) => {
      const foreignCanonicalSuffix = foreignSuffixes[0];
      const foreignPriorSuffix = foreignSuffixes[1];
      const prior = buildNamingSchemaVersion(
        priorVersion,
        [foreignPriorSuffix],
        DECISION_SUFFIXES,
        specFileSuffixForRole(false),
      );
      const selected = buildNamingSchemaVersion(
        canonicalVersion,
        [foreignCanonicalSuffix],
        DECISION_SUFFIXES,
        specFileSuffixForRole(true),
      );
      return {
        schemaVersions: [prior, selected],
        selectedVersions: [selected],
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
    .filter(([, leftVersion, rightVersion]) => semverOrderOracle(leftVersion, rightVersion) !== 0)
    .map(([demotedIndex, leftVersion, rightVersion]) => {
      const demotedRegistrySuffix = NODE_SUFFIXES[demotedIndex];
      const canonicalRegistrySuffixes = NODE_SUFFIXES.filter((_, index) => index !== demotedIndex);
      const canonicalRegistrySuffix = canonicalRegistrySuffixes[0];
      const priorVersion = semverOrderOracle(leftVersion, rightVersion) < 0 ? leftVersion : rightVersion;
      const canonicalVersion = priorVersion === leftVersion ? rightVersion : leftVersion;
      const prior = buildNamingSchemaVersion(
        priorVersion,
        [demotedRegistrySuffix],
        DECISION_SUFFIXES,
        specFileSuffixForRole(false),
      );
      const selected = buildNamingSchemaVersion(
        canonicalVersion,
        canonicalRegistrySuffixes,
        DECISION_SUFFIXES,
        specFileSuffixForRole(true),
      );
      return {
        schemaVersions: [prior, selected],
        selectedVersions: [selected],
        demotedRegistrySuffix,
        demotedVersion: priorVersion,
        canonicalRegistrySuffix,
      };
    });
}

/** The filesystem record of an ordered node directory `{order}{separator}{slug}{suffix}`. */
export function orderedDirectoryRecord(
  order: number,
  slug: string,
  suffix: string,
): { readonly type: SpecTreeFilesystemRecordType; readonly relativePath: string } {
  return {
    type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
    relativePath: `${order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${suffix}`,
  };
}

/**
 * One injected naming-schema tuple, in an arbitrary order, whose several versions ordered before the
 * declared target accept one suffix that no selected version accepts, beside a version ordered after
 * the target that accepts it too. The expected version is the newest of the prior versions, chosen by
 * the semantic-version maximum oracle.
 */
export type SupersededTupleScenario = {
  readonly schemaVersions: readonly NamingSchemaVersion[];
  /** The members of `schemaVersions` the scenario's methodology declaration selects. */
  readonly selectedVersions: readonly NamingSchemaVersion[];
  readonly suffix: string;
  readonly expectedVersion: string;
};

function arbitrarySupersededTupleScenario(): fc.Arbitrary<SupersededTupleScenario> {
  return fc
    .record({
      priorCount: fc.integer({
        min: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.SUPERSEDED_PRIOR_MIN,
        max: NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.SUPERSEDED_PRIOR_MAX,
      }),
      suffixes: fc.uniqueArray(arbitrarySuffix(), {
        minLength: 1 + NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.SUPERSEDED_TARGET_SUFFIX_COUNT,
        maxLength: 1 + NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.SUPERSEDED_TARGET_SUFFIX_COUNT,
      }),
    })
    .chain(({ priorCount, suffixes }) =>
      fc
        .uniqueArray(arbitrarySemver(), {
          minLength: priorCount + NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.SUPERSEDED_NON_PRIOR_COUNT,
          maxLength: priorCount + NAMING_SCHEMA_VERSION_GENERATOR_OPTIONS.SUPERSEDED_NON_PRIOR_COUNT,
        })
        .map((versions) => {
          const ascending = [...versions].sort(semverOrderOracle);
          const [sharedSuffix, ...targetSuffixes] = suffixes;
          const priors = ascending.slice(0, priorCount).map((version) =>
            buildNamingSchemaVersion(version, [sharedSuffix], DECISION_SUFFIXES, specFileSuffixForRole(false))
          );
          const target = buildNamingSchemaVersion(
            ascending[priorCount],
            targetSuffixes,
            DECISION_SUFFIXES,
            specFileSuffixForRole(true),
          );
          const later = buildNamingSchemaVersion(
            ascending[priorCount + 1],
            [sharedSuffix],
            DECISION_SUFFIXES,
            specFileSuffixForRole(true),
          );
          return { priors, target, later, sharedSuffix };
        })
    )
    .chain(({ priors, target, later, sharedSuffix }) =>
      fc
        .shuffledSubarray([...priors, target, later], {
          minLength: priors.length + 2,
          maxLength: priors.length + 2,
        })
        .map((schemaVersions) => ({
          schemaVersions,
          selectedVersions: [target],
          suffix: sharedSuffix,
          expectedVersion: semverMaximumOracle(priors).version,
        }))
    );
}

/**
 * One injected naming-schema tuple in which several versions ordered before the declared target
 * accept the same suffix no selected version accepts, beside a version ordered after the target
 * that accepts it too. The expected version is the newest version ordered before the target.
 */
export type NewestSupersededVersionCase = {
  readonly title: string;
  readonly schemaVersions: readonly NamingSchemaVersion[];
  /** The members of `schemaVersions` the case's methodology declaration selects. */
  readonly selectedVersions: readonly NamingSchemaVersion[];
  readonly suffix: string;
  readonly expectedVersion: string;
};

const NEWEST_SUPERSEDED_VERSION_COUNT = 4;
const NEWEST_SUPERSEDED_SELECTED_SUFFIX_COUNT = 2;
const NEWEST_SUPERSEDED_ORDER_ROLES = {
  OLDEST: 0,
  NEWEST_PRIOR: 1,
  TARGET: 2,
  LATER: 3,
} as const;

function permutations<T>(items: readonly T[]): readonly (readonly T[])[] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest])
  );
}

/**
 * Every ordering of one injected tuple whose versions are oldest, newest-prior, target, and later,
 * so no position in the tuple decides which version the suffix belongs to. The expected version
 * comes from the construction: the newest-prior version is the one ordered by the semantic-version
 * oracle directly below the target.
 */
export function newestSupersededVersionCases(): readonly NewestSupersededVersionCase[] {
  const drawn = sampleGeneratedValue(
    fc.record({
      versions: fc.uniqueArray(arbitrarySemver(), {
        minLength: NEWEST_SUPERSEDED_VERSION_COUNT,
        maxLength: NEWEST_SUPERSEDED_VERSION_COUNT,
        selector: (version) => version,
      }),
      suffixes: fc.uniqueArray(arbitrarySuffix(), {
        minLength: 1 + NEWEST_SUPERSEDED_SELECTED_SUFFIX_COUNT,
        maxLength: 1 + NEWEST_SUPERSEDED_SELECTED_SUFFIX_COUNT,
      }),
    }).filter(({ versions }) =>
      versions.every((left, leftIndex) =>
        versions.every((right, rightIndex) => leftIndex === rightIndex || semverOrderOracle(left, right) !== 0)
      )
    ),
  );
  const ascending = [...drawn.versions].sort(semverOrderOracle);
  const [sharedSuffix, ...targetSuffixes] = drawn.suffixes;
  const oldest = buildNamingSchemaVersion(
    ascending[NEWEST_SUPERSEDED_ORDER_ROLES.OLDEST],
    [sharedSuffix],
    DECISION_SUFFIXES,
    specFileSuffixForRole(false),
  );
  const newestPrior = buildNamingSchemaVersion(
    ascending[NEWEST_SUPERSEDED_ORDER_ROLES.NEWEST_PRIOR],
    [sharedSuffix],
    DECISION_SUFFIXES,
    specFileSuffixForRole(false),
  );
  const target = buildNamingSchemaVersion(
    ascending[NEWEST_SUPERSEDED_ORDER_ROLES.TARGET],
    targetSuffixes,
    DECISION_SUFFIXES,
    specFileSuffixForRole(true),
  );
  const later = buildNamingSchemaVersion(
    ascending[NEWEST_SUPERSEDED_ORDER_ROLES.LATER],
    [sharedSuffix],
    DECISION_SUFFIXES,
    specFileSuffixForRole(true),
  );
  return permutations([oldest, newestPrior, target, later]).map((schemaVersions, index) => ({
    title: `orders the tuple as permutation ${index} and keeps the newest prior version`,
    schemaVersions,
    selectedVersions: [target],
    suffix: sharedSuffix,
    expectedVersion: newestPrior.version,
  }));
}
