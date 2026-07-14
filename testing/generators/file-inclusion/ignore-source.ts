import * as fc from "fast-check";

import { DEFAULT_IGNORE_SOURCE_OVERRIDES, type IgnoreSourceReaderConfig } from "@/lib/file-inclusion/ignore-source";
import { SPEC_TREE_CONFIG, specTreeConfigDescriptor } from "@/lib/spec-tree";
import { GIT_WORKTREE_TEST_GENERATOR } from "@testing/generators/git-worktree/git-worktree";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";

const IGNORE_SOURCE_COMMENT_LINES = {
  HEADER: "# header comment",
  INDENTED: "  # indented comment",
  MIDDLE: "# middle comment",
} as const;

const INVALID_IGNORE_SOURCE_ENTRIES = [
  "/absolute/node.enabler",
  "../outside-spx",
  "21-example.enabler/../escape",
  "./21-example.enabler",
  "21-example.enabler/../..",
  "21-example.enabler//nested.enabler",
  "21-example.enabler/",
] as const;

const IGNORE_SOURCE_PROPERTY_LIMITS = {
  SEGMENT_MAX: 3,
  QUERY_MAX: 4,
} as const;

export const FILE_INCLUSION_IGNORE_SOURCE_GENERATOR = {
  commentHeader: arbitraryCommentHeader,
  commentIndented: arbitraryCommentIndented,
  commentMiddle: arbitraryCommentMiddle,
  excludeFilename: arbitraryExcludeFilename,
  integrationConfig: arbitraryIntegrationConfig,
  invalidEntries: arbitraryInvalidEntries,
  propertyLimits: arbitraryPropertyLimits,
  readerConfig: arbitraryReaderConfig,
  rootSegment: arbitraryRootSegment,
} as const;

export function sampleFileInclusionIgnoreSourceValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1 });
  if (value === undefined) {
    throw new Error("File-inclusion ignore-source generator returned no sample");
  }
  return value;
}

function arbitraryRootSegment(): fc.Arbitrary<string> {
  return fc.constant(SPEC_TREE_CONFIG.ROOT_DIRECTORY);
}

function arbitraryExcludeFilename(): fc.Arbitrary<string> {
  return GIT_WORKTREE_TEST_GENERATOR.gitignorePattern();
}

function arbitraryReaderConfig(): fc.Arbitrary<IgnoreSourceReaderConfig> {
  return fc.constant({ overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES });
}

function arbitraryIntegrationConfig(): fc.Arbitrary<Config> {
  return fc.constant({
    [specTreeConfigDescriptor.section]: specTreeConfigDescriptor.defaults,
  });
}

function arbitraryCommentHeader(): fc.Arbitrary<string> {
  return fc.constant(IGNORE_SOURCE_COMMENT_LINES.HEADER);
}

function arbitraryCommentIndented(): fc.Arbitrary<string> {
  return fc.constant(IGNORE_SOURCE_COMMENT_LINES.INDENTED);
}

function arbitraryCommentMiddle(): fc.Arbitrary<string> {
  return fc.constant(IGNORE_SOURCE_COMMENT_LINES.MIDDLE);
}

function arbitraryInvalidEntries(): fc.Arbitrary<readonly string[]> {
  return fc.constant(INVALID_IGNORE_SOURCE_ENTRIES);
}

function arbitraryPropertyLimits(): fc.Arbitrary<typeof IGNORE_SOURCE_PROPERTY_LIMITS> {
  return fc.constant(IGNORE_SOURCE_PROPERTY_LIMITS);
}
