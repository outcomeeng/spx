import * as fc from "fast-check";

import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import type { Config } from "@/config/types";
import { REGISTERED_TOOL_NAMES } from "@/lib/file-inclusion";
import {
  DEFAULT_SCOPE_CONFIG,
  DEFAULT_TOOLS_CONFIG,
  FILE_INCLUSION_CONFIG_FIELDS,
  FILE_INCLUSION_SECTION,
  type FileInclusionConfig,
} from "@/lib/file-inclusion/config";
import { SPEC_TREE_METHODOLOGY_LINE, SPEC_TREE_SECTION } from "@/lib/spec-tree";

const GENERATED_SEGMENT_MIN_LENGTH = 3;
const GENERATED_SEGMENT_MAX_LENGTH = 12;
const GENERATED_SEGMENT_SUFFIX_MIN_LENGTH = GENERATED_SEGMENT_MIN_LENGTH - 1;
const GENERATED_SEGMENT_SUFFIX_MAX_LENGTH = GENERATED_SEGMENT_MAX_LENGTH - 1;

/**
 * Canonical minimal config: a spec-tree section that carries no `kinds` field, because the kind registry is fixed.
 * Use this as the default fixture wherever withTestEnv or spec-tree generators need a Config.
 */
export const MINIMAL_SPEC_TREE_CONFIG: Config = {
  [METHODOLOGY_SECTION]: { [METHODOLOGY_CONFIG_FIELDS.VERSION]: SPEC_TREE_METHODOLOGY_LINE.THREE_TWO },
  [SPEC_TREE_SECTION]: {},
};

export const CONFIG_GENERATOR = {
  fileInclusionOverride: arbitraryFileInclusionOverride,
  fileInclusionPartialToolOverride: arbitraryFileInclusionPartialToolOverride,
  fileInclusionUnknownToolOverride: arbitraryFileInclusionUnknownToolOverride,
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
