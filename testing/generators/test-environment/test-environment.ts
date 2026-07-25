import * as fc from "fast-check";

import type { Config } from "@/config/types";
import {
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
  specTreeConfigDescriptor,
  type SpecTreeKindCategory,
} from "@/lib/spec-tree";

const MIN_SPEC_ORDER_INDEX = 10;
const MAX_SPEC_ORDER_INDEX = 99;
const MAX_FIXTURE_ENTRIES = 5;
const MAX_PARALLEL_ENVIRONMENTS = 8;
const MAX_CALLBACK_AWAITS = 3;
const MAX_GENERATED_SEGMENT_LENGTH = 20;
const MIN_PARALLEL_ENVIRONMENTS = 2;
const GENERATED_SEGMENT_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyz"] as const;
const RAW_FIXTURE_EXTENSION = ".txt";
const SAMPLE_SEED = 20_260_724;
const SPEC_FILE_SUFFIX = SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX;

export const TEST_ENVIRONMENT_CALLBACK_OUTCOME = {
  RETURN: "return",
  THROW: "throw",
} as const;

export type SpecTreeFixtureEntry = {
  readonly contents: string;
  readonly fixturePath: string;
  readonly kind: string;
  readonly path: string;
};

export type SpecTreeFixture = {
  readonly entries: readonly SpecTreeFixtureEntry[];
};

export type GeneratedTestEnvironmentIsolationCase = {
  readonly environments: readonly {
    readonly marker: string;
  }[];
  /** One path every parallel environment writes, so a leak across environments is observable. */
  readonly relativePath: string;
};

export type GeneratedTestEnvironmentLifecycleCase = {
  readonly awaits: number;
  readonly callbackError: Error;
  readonly outcome: (typeof TEST_ENVIRONMENT_CALLBACK_OUTCOME)[keyof typeof TEST_ENVIRONMENT_CALLBACK_OUTCOME];
};

export type GeneratedContextDeterminismCase = {
  readonly extraDecisionFile: string;
  readonly extraNodeDirectory: string;
};

export type GeneratedNodeWriteCase = {
  readonly contents: string;
  readonly fixturePath: string;
  readonly nodeId: string;
};

export type GeneratedTestEnvironmentHelperCases = {
  readonly decision: GeneratedWriteCase;
  readonly node: GeneratedWriteCase;
  readonly raw: GeneratedWriteCase;
};

export type GeneratedWriteCase = {
  readonly contents: string;
  readonly fixturePath: string;
};

type KindEntry = {
  readonly category: SpecTreeKindCategory;
  readonly kind: string;
  readonly suffix: string;
};

function generatedSegment(): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...GENERATED_SEGMENT_CHARACTERS), {
      minLength: 1,
      maxLength: MAX_GENERATED_SEGMENT_LENGTH,
    })
    .map((characters) => characters.join(""));
}

function readKinds(config: Config, category: SpecTreeKindCategory): readonly KindEntry[] {
  const validated = specTreeConfigDescriptor.validate(config[SPEC_TREE_CONFIG.SECTION]);
  if (!validated.ok) {
    throw new Error(
      `Config supplied to spec-tree generators has an unusable ${SPEC_TREE_CONFIG.SECTION} section: ${validated.error}`,
    );
  }
  return Object.entries(validated.value.kinds)
    .filter(([, definition]) => definition.category === category)
    .map(([kind, definition]) => ({ category, kind, suffix: definition.suffix }));
}

function arbitraryEntryFromKinds(entries: readonly KindEntry[]): fc.Arbitrary<SpecTreeFixtureEntry> {
  return fc
    .tuple(
      fc.integer({ min: MIN_SPEC_ORDER_INDEX, max: MAX_SPEC_ORDER_INDEX }),
      generatedSegment(),
      generatedSegment(),
      fc.constantFrom(...entries),
    )
    .map(([index, slug, title, entry]) => {
      const path = `${index}-${slug}${entry.suffix}`;
      return {
        contents: `# ${title}\n`,
        fixturePath: entry.category === SPEC_TREE_CONFIG.CATEGORY.NODE
          ? [SPEC_TREE_CONFIG.ROOT_DIRECTORY, path, `${slug}${SPEC_FILE_SUFFIX}`].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR)
          : [SPEC_TREE_CONFIG.ROOT_DIRECTORY, path].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
        kind: entry.kind,
        path,
      };
    });
}

export function arbitraryNodePath(config: Config): fc.Arbitrary<string> {
  const entries = readKinds(config, SPEC_TREE_CONFIG.CATEGORY.NODE);
  if (entries.length === 0) {
    throw new Error("Config supplied to arbitraryNodePath has no node kinds registered");
  }
  return arbitraryEntryFromKinds(entries).map((entry) => entry.path);
}

export function arbitraryDecisionPath(config: Config): fc.Arbitrary<string> {
  const entries = readKinds(config, SPEC_TREE_CONFIG.CATEGORY.DECISION);
  if (entries.length === 0) {
    throw new Error("Config supplied to arbitraryDecisionPath has no decision kinds registered");
  }
  return arbitraryEntryFromKinds(entries).map((entry) => entry.path);
}

function arbitraryContextDeterminismCase(config: Config): fc.Arbitrary<GeneratedContextDeterminismCase> {
  return fc.record({
    extraDecisionFile: arbitraryDecisionPath(config),
    extraNodeDirectory: arbitraryNodePath(config),
  });
}

export function arbitrarySpecTree(config: Config): fc.Arbitrary<SpecTreeFixture> {
  const entries = [
    ...readKinds(config, SPEC_TREE_CONFIG.CATEGORY.NODE),
    ...readKinds(config, SPEC_TREE_CONFIG.CATEGORY.DECISION),
  ];
  if (entries.length === 0) {
    throw new Error("Config supplied to arbitrarySpecTree has no kinds registered");
  }
  return fc
    .array(arbitraryEntryFromKinds(entries), { minLength: 0, maxLength: MAX_FIXTURE_ENTRIES })
    .map((generatedEntries) => ({ entries: generatedEntries }));
}

function nodeWriteCase(
  nodePaths: fc.Arbitrary<string>,
): fc.Arbitrary<GeneratedNodeWriteCase> {
  return fc
    .tuple(nodePaths, generatedSegment(), generatedSegment())
    .map(([nodeId, filename, title]) => ({
      contents:
        `# ${title}\n\nPROVIDES generated node state\nSO THAT test environments\nCAN expose meaningful product fixtures\n`,
      fixturePath: [SPEC_TREE_CONFIG.ROOT_DIRECTORY, nodeId, `${filename}${SPEC_FILE_SUFFIX}`].join(
        SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
      ),
      nodeId,
    }));
}

function helperCases(config: Config): fc.Arbitrary<GeneratedTestEnvironmentHelperCases> {
  return fc
    .tuple(
      nodeWriteCase(arbitraryNodePath(config)),
      arbitraryDecisionPath(config),
      generatedSegment(),
      generatedSegment(),
      generatedSegment(),
    )
    .map(([node, decisionPath, decisionTitle, rawPath, rawContents]) => ({
      node,
      decision: {
        contents: `# ${decisionTitle}\n`,
        fixturePath: [SPEC_TREE_CONFIG.ROOT_DIRECTORY, decisionPath].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
      },
      raw: {
        contents: rawContents,
        fixturePath: [rawPath, `${rawPath}${RAW_FIXTURE_EXTENSION}`].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
      },
    }));
}

function isolationCase(): fc.Arbitrary<GeneratedTestEnvironmentIsolationCase> {
  return fc
    .tuple(
      generatedSegment(),
      fc.uniqueArray(generatedSegment(), {
        minLength: MIN_PARALLEL_ENVIRONMENTS,
        maxLength: MAX_PARALLEL_ENVIRONMENTS,
      }),
    )
    .map(([sharedName, markers]) => ({
      environments: markers.map((marker) => ({ marker })),
      relativePath: `${sharedName}${RAW_FIXTURE_EXTENSION}`,
    }));
}

function lifecycleCase(): fc.Arbitrary<GeneratedTestEnvironmentLifecycleCase> {
  return fc
    .record({
      awaits: fc.integer({ min: 0, max: MAX_CALLBACK_AWAITS }),
      errorMessage: generatedSegment(),
      outcome: fc.constantFrom(...Object.values(TEST_ENVIRONMENT_CALLBACK_OUTCOME)),
    })
    .map(({ awaits, errorMessage, outcome }) => ({
      awaits,
      callbackError: new Error(errorMessage),
      outcome,
    }));
}

/**
 * Draws one case from a test-environment arbitrary for a scenario that needs a single fixture.
 * The seed is fixed so a scenario draws the same case on every run and a failure reproduces.
 */
export function sampleTestEnvironmentValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1, seed: SAMPLE_SEED });
  if (value === undefined) {
    throw new Error("Test-environment generator returned no sample");
  }
  return value;
}

export const TEST_ENVIRONMENT_GENERATOR = {
  contextDeterminismCase: arbitraryContextDeterminismCase,
  helperCases,
  nodeWriteCase,
  isolationCase,
  lifecycleCase,
} as const;
