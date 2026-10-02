import * as fc from "fast-check";
import { posix } from "node:path";

import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import {
  MARKDOWN_PRIMARY_FILE_EXTENSION,
  MARKDOWN_VALIDATION_TARGET_KIND,
  type MarkdownValidationTarget,
} from "@/validation/steps/markdown";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

const SPX_DIRECTORY_NAME = "spx";
const DOCS_DIRECTORY_NAME = "docs";
const SAMPLE_DIRECTORY_NAME = "21-sample.outcome";
const DECLARED_NODE_FRAGMENT = "32-declared";
const DECLARED_NODE_DIRECTORY = "32-declared.outcome";
const DECLARED_MARKDOWN_FILE = "declared.md";
const DECLARED_MARKDOWN_EXTENSION_FILE = "declared.markdown";
const DECLARED_CHILD_DIRECTORY = "43-child.enabler";
const DATA_URI_MARKER = "data:";
const MISSING_HEADING_MARKER = "nonexistent-heading";
const MISSING_FILE_MARKER = "does-not-exist";
const MD024_RULE_MARKER = "MD024";
const CHILD_MARKDOWN_FILE = "child.md";
const COLON_MARKDOWN_FILE = "api:v2.md";
const SAMPLE_MARKDOWN_FILE = "sample.md";
const TARGET_MARKDOWN_FILE = "target.md";
const SOURCE_MARKDOWN_FILE = "source.md";
const BROKEN_MARKDOWN_FILE = "broken.md";
const BROKEN_MARKDOWN_EXTENSION_FILE = "broken.markdown";
const BROKEN_RELATIVE_TARGET_MARKER = "deleted.md";
const DEFAULT_SPX_BROKEN_FILE = "default-spx-broken.md";
const DEFAULT_DOCS_BROKEN_FILE = "default-docs-broken.md";
const EXPLICIT_SCOPE_DOCS_DECOY_FILE = "explicit-scope-docs-decoy.md";
const OUTSIDE_DEFAULT_DIRECTORY_NAME = "outside";
const OUTSIDE_DEFAULT_BROKEN_FILE = "outside-default-broken.md";
const MISSING_MARKDOWN_SCOPE_FILE = "missing.md";
const UNRELATED_MARKDOWN_SCOPE_FILE = "notes.txt";
const GUIDE_DIRECTORY_NAME = "guides";
const DOCS_DIRECT_FILE_MD024_CONTENT = "# Page\n\n## Repeat\n\n## Repeat\n";
const VALID_MARKDOWN_TARGET_CONTENT = "# Target\n\nContent.\n";
const VALID_MARKDOWN_SOURCE_CONTENT = "# Source\n\n[valid](./target.md)\n";
const BROKEN_MARKDOWN_CONTENT = "# Broken\n\n[broken](./does-not-exist.md)\n";
const VALID_FRAGMENT_SOURCE_CONTENT = "# Source\n\n[valid](./target.md#target)\n";
const BROKEN_FRAGMENT_SOURCE_CONTENT = "# Source\n\n[broken](./target.md#nonexistent-heading)\n";
const UNRELATED_MARKDOWN_SCOPE_CONTENT = "plain text\n";
const MARKDOWN_HELP_FLAG = "--help";
const EXPECTED_ZERO = 0;
const EXPECTED_ONE = 1;
const EXPECTED_TWO = 2;

export const EXPLICIT_MARKDOWN_OPERAND_KIND = {
  DIRECTORY: "directory",
  FILE: "file",
} as const;

export type ExplicitMarkdownOperandKind =
  (typeof EXPLICIT_MARKDOWN_OPERAND_KIND)[keyof typeof EXPLICIT_MARKDOWN_OPERAND_KIND];

export interface ExplicitMarkdownOperandScenario {
  readonly excludedDirectory: string;
  readonly operand: string;
  readonly markdownPath: string;
}

export function arbitraryExplicitMarkdownOperandScenario(
  kind: ExplicitMarkdownOperandKind,
): fc.Arbitrary<ExplicitMarkdownOperandScenario> {
  return fc
    .tuple(arbitraryDomainLiteral(), arbitraryDomainLiteral(), arbitraryDomainLiteral())
    .filter((segments) => new Set(segments).size === segments.length)
    .map(([excludedDirectoryName, childDirectoryName, markdownFileStem]) => {
      const excludedDirectory = posix.join(
        SPEC_TREE_CONFIG.ROOT_DIRECTORY,
        excludedDirectoryName,
      );
      const operand = kind === EXPLICIT_MARKDOWN_OPERAND_KIND.DIRECTORY
        ? posix.join(excludedDirectory, childDirectoryName)
        : posix.join(
          excludedDirectory,
          `${markdownFileStem}${MARKDOWN_PRIMARY_FILE_EXTENSION}`,
        );
      return {
        excludedDirectory,
        operand,
        markdownPath: kind === EXPLICIT_MARKDOWN_OPERAND_KIND.DIRECTORY
          ? posix.join(
            operand,
            `${markdownFileStem}${MARKDOWN_PRIMARY_FILE_EXTENSION}`,
          )
          : operand,
      };
    });
}

function lineContaining(content: string, marker: string): number {
  return content.split("\n").findIndex((line) => line.includes(marker)) + 1;
}

export const MARKDOWN_VALIDATION_DATA = {
  spxDirectoryName: SPX_DIRECTORY_NAME,
  docsDirectoryName: DOCS_DIRECTORY_NAME,
  sampleDirectoryName: SAMPLE_DIRECTORY_NAME,
  declaredNodeFragment: DECLARED_NODE_FRAGMENT,
  declaredNodeDirectory: DECLARED_NODE_DIRECTORY,
  declaredMarkdownFile: DECLARED_MARKDOWN_FILE,
  declaredMarkdownExtensionFile: DECLARED_MARKDOWN_EXTENSION_FILE,
  declaredChildDirectory: DECLARED_CHILD_DIRECTORY,
  dataUriMarker: DATA_URI_MARKER,
  missingHeadingMarker: MISSING_HEADING_MARKER,
  missingFileMarker: MISSING_FILE_MARKER,
  md024RuleMarker: MD024_RULE_MARKER,
  childMarkdownFile: CHILD_MARKDOWN_FILE,
  colonMarkdownFile: COLON_MARKDOWN_FILE,
  sampleMarkdownFile: SAMPLE_MARKDOWN_FILE,
  targetMarkdownFile: TARGET_MARKDOWN_FILE,
  sourceMarkdownFile: SOURCE_MARKDOWN_FILE,
  brokenMarkdownFile: BROKEN_MARKDOWN_FILE,
  brokenMarkdownExtensionFile: BROKEN_MARKDOWN_EXTENSION_FILE,
  brokenRelativeTargetMarker: BROKEN_RELATIVE_TARGET_MARKER,
  defaultSpxBrokenFile: DEFAULT_SPX_BROKEN_FILE,
  defaultDocsBrokenFile: DEFAULT_DOCS_BROKEN_FILE,
  explicitScopeDocsDecoyFile: EXPLICIT_SCOPE_DOCS_DECOY_FILE,
  outsideDefaultDirectoryName: OUTSIDE_DEFAULT_DIRECTORY_NAME,
  outsideDefaultBrokenFile: OUTSIDE_DEFAULT_BROKEN_FILE,
  missingMarkdownScopeFile: MISSING_MARKDOWN_SCOPE_FILE,
  unrelatedMarkdownScopeFile: UNRELATED_MARKDOWN_SCOPE_FILE,
  guideDirectoryName: GUIDE_DIRECTORY_NAME,
  docsDirectFileMd024Content: DOCS_DIRECT_FILE_MD024_CONTENT,
  validMarkdownTargetContent: VALID_MARKDOWN_TARGET_CONTENT,
  validMarkdownSourceContent: VALID_MARKDOWN_SOURCE_CONTENT,
  brokenMarkdownContent: BROKEN_MARKDOWN_CONTENT,
  validFragmentSourceContent: VALID_FRAGMENT_SOURCE_CONTENT,
  brokenFragmentSourceContent: BROKEN_FRAGMENT_SOURCE_CONTENT,
  brokenMarkdownLinkLine: lineContaining(BROKEN_MARKDOWN_CONTENT, MISSING_FILE_MARKER),
  unrelatedMarkdownScopeContent: UNRELATED_MARKDOWN_SCOPE_CONTENT,
  helpFlag: MARKDOWN_HELP_FLAG,
  zero: EXPECTED_ZERO,
  one: EXPECTED_ONE,
  two: EXPECTED_TWO,
} as const;

export function markdownDirectoryTarget(path: string): MarkdownValidationTarget {
  return {
    kind: MARKDOWN_VALIDATION_TARGET_KIND.DIRECTORY,
    path,
  };
}

export function markdownFileTarget(path: string): MarkdownValidationTarget {
  return {
    kind: MARKDOWN_VALIDATION_TARGET_KIND.FILE,
    path,
  };
}
