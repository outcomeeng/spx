import * as fc from "fast-check";

import type { Config } from "@/config/types";
import { REGISTERED_TOOL_NAMES } from "@/lib/file-inclusion";
import {
  DEFAULT_SCOPE_CONFIG,
  DEFAULT_TOOLS_CONFIG,
  FILE_INCLUSION_CONFIG_FIELDS,
  FILE_INCLUSION_SECTION,
  type FileInclusionConfig,
} from "@/lib/file-inclusion/config";
import { DECISION_KINDS, KIND_REGISTRY, NODE_KINDS, SPEC_TREE_SECTION } from "@/lib/spec-tree";

const GENERATED_SEGMENT_MIN_LENGTH = 3;
const GENERATED_SEGMENT_MAX_LENGTH = 12;
const GENERATED_SEGMENT_SUFFIX_MIN_LENGTH = GENERATED_SEGMENT_MIN_LENGTH - 1;
const GENERATED_SEGMENT_SUFFIX_MAX_LENGTH = GENERATED_SEGMENT_MAX_LENGTH - 1;

/**
 * Canonical minimal config with all registered kinds.
 * Use this as the default fixture wherever withTestEnv or spec-tree generators need a Config.
 * Built entirely from KIND_REGISTRY — no inline string literals.
 */
export const MINIMAL_SPEC_TREE_CONFIG: Config = {
  [SPEC_TREE_SECTION]: { kinds: { ...KIND_REGISTRY } },
};

export const CONFIG_GENERATOR = {
  fileInclusionOverride: arbitraryFileInclusionOverride,
  fileInclusionPartialToolOverride: arbitraryFileInclusionPartialToolOverride,
  fileInclusionUnknownToolOverride: arbitraryFileInclusionUnknownToolOverride,
  validSpecTreeConfig: arbitraryValidSpecTreeConfig,
} as const;

export type GeneratedFileInclusionOverride = {
  readonly config: Config;
  readonly expected: FileInclusionConfig;
  readonly selectedTool: string;
};

export type GeneratedFileInclusionUnknownToolOverride = {
  readonly config: Config;
  readonly toolName: string;
};

export function sampleConfigValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1 });
  if (value === undefined) throw new Error("Config generator returned no sample");
  return value;
}

/**
 * Generates valid Config objects with arbitrary non-empty subsets of the registered kinds.
 * Every generated config contains at least one node kind and one decision kind,
 * satisfying the minimum contract for spec-tree generators (arbitraryNodePath, arbitraryDecisionPath).
 */
function arbitraryValidSpecTreeConfig(): fc.Arbitrary<Config> {
  return fc
    .record({
      nodeSubset: fc.subarray([...NODE_KINDS], { minLength: 1 }),
      decisionSubset: fc.subarray([...DECISION_KINDS], { minLength: 1 }),
    })
    .map(({ nodeSubset, decisionSubset }) => ({
      [SPEC_TREE_SECTION]: {
        kinds: Object.fromEntries([...nodeSubset, ...decisionSubset].map((k) => [k, KIND_REGISTRY[k]])),
      },
    }));
}

function arbitraryConfigSegment(): fc.Arbitrary<string> {
  return fc.stringMatching(
    new RegExp(`^[a-z][a-z0-9-]{${GENERATED_SEGMENT_SUFFIX_MIN_LENGTH},${GENERATED_SEGMENT_SUFFIX_MAX_LENGTH}}$`),
    { maxLength: GENERATED_SEGMENT_MAX_LENGTH },
  );
}

function arbitraryUnknownToolName(): fc.Arbitrary<string> {
  return arbitraryConfigSegment().filter((toolName) => !REGISTERED_TOOL_NAMES.includes(toolName));
}

function arbitraryFileInclusionOverride(): fc.Arbitrary<GeneratedFileInclusionOverride> {
  return fc
    .record({
      selectedTool: fc.constantFrom(...REGISTERED_TOOL_NAMES),
      ignoreFlag: arbitraryConfigSegment().map((flag) => `--${flag}`),
    })
    .map(({ selectedTool, ignoreFlag }) => {
      const expected: FileInclusionConfig = {
        scope: DEFAULT_SCOPE_CONFIG,
        tools: {
          ...DEFAULT_TOOLS_CONFIG,
          [selectedTool]: { ignoreFlag },
        },
      };
      return {
        selectedTool,
        expected,
        config: {
          [FILE_INCLUSION_SECTION]: {
            [FILE_INCLUSION_CONFIG_FIELDS.SCOPE]: expected.scope,
            [FILE_INCLUSION_CONFIG_FIELDS.TOOLS]: {
              [selectedTool]: {
                [FILE_INCLUSION_CONFIG_FIELDS.IGNORE_FLAG]: ignoreFlag,
              },
            },
          },
        },
      };
    });
}

function arbitraryFileInclusionPartialToolOverride(): fc.Arbitrary<GeneratedFileInclusionOverride> {
  return fc.constantFrom(...REGISTERED_TOOL_NAMES).map((selectedTool) => {
    const expected: FileInclusionConfig = {
      scope: {
        ...DEFAULT_SCOPE_CONFIG,
      },
      tools: {
        ...DEFAULT_TOOLS_CONFIG,
        [selectedTool]: DEFAULT_TOOLS_CONFIG[selectedTool],
      },
    };
    return {
      selectedTool,
      expected,
      config: {
        [FILE_INCLUSION_SECTION]: {
          [FILE_INCLUSION_CONFIG_FIELDS.TOOLS]: {
            [selectedTool]: {},
          },
        },
      },
    };
  });
}

function arbitraryFileInclusionUnknownToolOverride(): fc.Arbitrary<GeneratedFileInclusionUnknownToolOverride> {
  return arbitraryUnknownToolName().map((toolName) => ({
    toolName,
    config: {
      [FILE_INCLUSION_SECTION]: {
        [FILE_INCLUSION_CONFIG_FIELDS.TOOLS]: {
          [toolName]: {},
        },
      },
    },
  }));
}
