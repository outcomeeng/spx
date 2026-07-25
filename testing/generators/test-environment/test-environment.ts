import * as fc from "fast-check";

import type { Config } from "@/config/types";
import {
  type Kind,
  type KindDefinition,
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
  type SpecTreeConfig,
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
    readonly relativePath: string;
  }[];
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
  const rawSpecTree = config[SPEC_TREE_CONFIG.SECTION];
  if (rawSpecTree === undefined || rawSpecTree === null || typeof rawSpecTree !== "object") {
    throw new Error(`Config supplied to spec-tree generators is missing the ${SPEC_TREE_CONFIG.SECTION} section`);
  }
  const specTree = rawSpecTree as SpecTreeConfig;
  return Object.entries(specTree.kinds)
    .filter((entry): entry is [string, KindDefinition<Kind>] => entry[1].category === category)
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
          ? [SPEC_TREE_CONFIG.ROOT_DIRECTORY, path, `${slug}.md`].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR)
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

export function arbitraryContextDeterminismCase(config: Config): fc.Arbitrary<GeneratedContextDeterminismCase> {
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
      fixturePath: [SPEC_TREE_CONFIG.ROOT_DIRECTORY, nodeId, `${filename}.md`].join(
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
        fixturePath: [rawPath, `${rawPath}.txt`].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
      },
    }));
}

function isolationCase(): fc.Arbitrary<GeneratedTestEnvironmentIsolationCase> {
  return fc
    .uniqueArray(generatedSegment(), {
      minLength: MIN_PARALLEL_ENVIRONMENTS,
      maxLength: MAX_PARALLEL_ENVIRONMENTS,
    })
    .map((markers) => ({
      environments: markers.map((marker) => ({ marker, relativePath: `${marker}.txt` })),
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

export const TEST_ENVIRONMENT_GENERATOR = {
  contextDeterminismCase: arbitraryContextDeterminismCase,
  helperCases,
  nodeWriteCase,
  isolationCase,
  lifecycleCase,
} as const;
