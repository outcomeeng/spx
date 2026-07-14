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
const PRODUCT_ABSOLUTE_SOURCE_CONTENT = "# Source\n\n[absolute](/spx/target.md)\n";
const IGNORED_LINK_TYPES_CONTENT =
  "# Links\n\n[external](https://example.com/missing)\n\n<a href=\"./missing.html\">HTML</a>\n";
const UNRELATED_MARKDOWN_SCOPE_CONTENT = "plain text\n";
const MARKDOWN_HELP_FLAG = "--help";
const EXPECTED_ZERO = 0;
const EXPECTED_ONE = 1;
const EXPECTED_TWO = 2;
const EXPECTED_THREE = 3;

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

export const MARKDOWN_SCENARIO_KIND = {
  CLEAN_TREE: "cleanTree",
  DATA_URI_ALLOWED: "dataUriAllowed",
  IGNORED_LINK_TYPES: "ignoredLinkTypes",
  BROKEN_LINKS: "brokenLinks",
  BROKEN_FRAGMENT: "brokenFragment",
  ERROR_SHAPE: "errorShape",
  PRODUCT_ABSOLUTE_LINK: "productAbsoluteLink",
  NO_SIDE_EFFECTS: "noSideEffects",
  DEFAULT_DIRECTORIES: "defaultDirectories",
  EXCLUDE_NODE: "excludeNode",
  EXCLUDE_NODE_EXACT_ONLY: "excludeNodeExactOnly",
  EXCLUDE_NODE_SCOPED_TARGET: "excludeNodeScopedTarget",
  REPOSITORY_EXCLUDE_PARITY: "repositoryExcludeParity",
  DUPLICATE_HEADINGS: "duplicateHeadings",
  CONFIG_BUILDER: "configBuilder",
  COMMAND_DEFAULTS: "commandDefaults",
  FILE_SCOPE_DOCS: "fileScopeDocs",
  FILE_SCOPE_CLEAN_SPX: "fileScopeCleanSpx",
  PIPELINE_FAILURE: "pipelineFailure",
  E2E_HELP: "e2eHelp",
  E2E_BROKEN_DIRECTORY: "e2eBrokenDirectory",
  E2E_VALID_DIRECTORY: "e2eValidDirectory",
  E2E_DIRECT_FILE: "e2eDirectFile",
  DOCS_DIRECT_FILE_MD024: "docsDirectFileMd024",
  MISSING_FILE_SCOPE_DIAGNOSTIC: "missingFileScopeDiagnostic",
  UNRELATED_FILE_SCOPE_DIAGNOSTIC: "unrelatedFileScopeDiagnostic",
  MIXED_FILE_SCOPE_DIAGNOSTIC: "mixedFileScopeDiagnostic",
  DIRECTORY_SCOPE_MD_ONLY: "directoryScopeMdOnly",
  COLON_PATH_ERROR: "colonPathError",
} as const;

export type MarkdownScenarioKind = (typeof MARKDOWN_SCENARIO_KIND)[keyof typeof MARKDOWN_SCENARIO_KIND];

export interface MarkdownValidationScenario {
  readonly title: string;
  readonly kind: MarkdownScenarioKind;
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
  productAbsoluteSourceContent: PRODUCT_ABSOLUTE_SOURCE_CONTENT,
  ignoredLinkTypesContent: IGNORED_LINK_TYPES_CONTENT,
  unrelatedMarkdownScopeContent: UNRELATED_MARKDOWN_SCOPE_CONTENT,
  helpFlag: MARKDOWN_HELP_FLAG,
  zero: EXPECTED_ZERO,
  one: EXPECTED_ONE,
  two: EXPECTED_TWO,
  three: EXPECTED_THREE,
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

export function markdownUnitScenarios(): MarkdownValidationScenario[] {
  return [
    {
      title: "clean markdown tree validates successfully",
      kind: MARKDOWN_SCENARIO_KIND.CLEAN_TREE,
    },
    {
      title: "data URI images are ignored by relative-link validation",
      kind: MARKDOWN_SCENARIO_KIND.DATA_URI_ALLOWED,
    },
    {
      title: "external and HTML links are ignored by relative-link validation",
      kind: MARKDOWN_SCENARIO_KIND.IGNORED_LINK_TYPES,
    },
    {
      title: "broken markdown links are reported",
      kind: MARKDOWN_SCENARIO_KIND.BROKEN_LINKS,
    },
    {
      title: "broken heading fragments are reported",
      kind: MARKDOWN_SCENARIO_KIND.BROKEN_FRAGMENT,
    },
    {
      title: "markdown errors include file line and detail",
      kind: MARKDOWN_SCENARIO_KIND.ERROR_SHAPE,
    },
    {
      title: "product-absolute links resolve from the product directory",
      kind: MARKDOWN_SCENARIO_KIND.PRODUCT_ABSOLUTE_LINK,
    },
    {
      title: "validation does not create files in validated directories",
      kind: MARKDOWN_SCENARIO_KIND.NO_SIDE_EFFECTS,
    },
    {
      title: "default markdown directories are discovered",
      kind: MARKDOWN_SCENARIO_KIND.DEFAULT_DIRECTORIES,
    },
    {
      title: "excluded spec nodes are skipped",
      kind: MARKDOWN_SCENARIO_KIND.EXCLUDE_NODE,
    },
    {
      title: "excluded spec nodes do not skip child nodes",
      kind: MARKDOWN_SCENARIO_KIND.EXCLUDE_NODE_EXACT_ONLY,
    },
    {
      title: "excluded spec nodes are skipped when directly targeted",
      kind: MARKDOWN_SCENARIO_KIND.EXCLUDE_NODE_SCOPED_TARGET,
    },
    {
      title: "repository exclusions equal direct spec-node markdown failures",
      kind: MARKDOWN_SCENARIO_KIND.REPOSITORY_EXCLUDE_PARITY,
    },
    {
      title: "duplicate heading policy is scoped by directory",
      kind: MARKDOWN_SCENARIO_KIND.DUPLICATE_HEADINGS,
    },
    {
      title: "markdownlint config contains the curated rule set",
      kind: MARKDOWN_SCENARIO_KIND.CONFIG_BUILDER,
    },
    {
      title: "directory targets recurse over md files only",
      kind: MARKDOWN_SCENARIO_KIND.DIRECTORY_SCOPE_MD_ONLY,
    },
    {
      title: "markdown errors are reported for file paths containing colons",
      kind: MARKDOWN_SCENARIO_KIND.COLON_PATH_ERROR,
    },
  ];
}

export function markdownIntegrationScenarios(): MarkdownValidationScenario[] {
  return [
    {
      title: "default markdown command validates default directories",
      kind: MARKDOWN_SCENARIO_KIND.COMMAND_DEFAULTS,
    },
    {
      title: "markdown command files scope can target docs only",
      kind: MARKDOWN_SCENARIO_KIND.FILE_SCOPE_DOCS,
    },
    {
      title: "markdown command files scope accepts a clean spx directory",
      kind: MARKDOWN_SCENARIO_KIND.FILE_SCOPE_CLEAN_SPX,
    },
    {
      title: "markdown failure fails the full pipeline",
      kind: MARKDOWN_SCENARIO_KIND.PIPELINE_FAILURE,
    },
    {
      title: "markdown command reports unrelated file scopes",
      kind: MARKDOWN_SCENARIO_KIND.UNRELATED_FILE_SCOPE_DIAGNOSTIC,
    },
    {
      title: "markdown command reports missing file scopes",
      kind: MARKDOWN_SCENARIO_KIND.MISSING_FILE_SCOPE_DIAGNOSTIC,
    },
    {
      title: "markdown command reports skipped file scopes while validating markdown scopes",
      kind: MARKDOWN_SCENARIO_KIND.MIXED_FILE_SCOPE_DIAGNOSTIC,
    },
  ];
}

export function markdownE2eScenarios(): MarkdownValidationScenario[] {
  return [
    {
      title: "markdown command help is registered",
      kind: MARKDOWN_SCENARIO_KIND.E2E_HELP,
    },
    {
      title: "markdown command reports broken links from a directory scope",
      kind: MARKDOWN_SCENARIO_KIND.E2E_BROKEN_DIRECTORY,
    },
    {
      title: "markdown command accepts valid directory scope",
      kind: MARKDOWN_SCENARIO_KIND.E2E_VALID_DIRECTORY,
    },
    {
      title: "markdown command accepts direct markdown file scope",
      kind: MARKDOWN_SCENARIO_KIND.E2E_DIRECT_FILE,
    },
    {
      title: "markdown direct docs file scope keeps docs heading policy",
      kind: MARKDOWN_SCENARIO_KIND.DOCS_DIRECT_FILE_MD024,
    },
  ];
}
