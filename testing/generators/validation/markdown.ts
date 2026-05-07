import { MARKDOWN_VALIDATION_TARGET_KIND, type MarkdownValidationTarget } from "@/validation/steps/markdown";
import {
  MARKDOWN_FIXTURES,
  MARKDOWN_HARNESS_TIMEOUT,
  type MarkdownFixtureName,
} from "@testing/harnesses/with-markdown-env";

const MARKDOWN_UNIT_TEMP_PREFIX = "mdlint-unit-";
const MARKDOWN_E2E_TEMP_PREFIX = "mdlint-e2e-";
const SPX_DIRECTORY_NAME = "spx";
const DOCS_DIRECTORY_NAME = "docs";
const FEATURE_DIRECTORY_NAME = "21-feature.outcome";
const DECLARED_NODE_FRAGMENT = "32-declared";
const DATA_URI_MARKER = "data:";
const MISSING_HEADING_MARKER = "nonexistent-heading";
const MISSING_FILE_MARKER = "does-not-exist";
const MD024_RULE_MARKER = "MD024";
const CHILD_MARKDOWN_FILE = "child.md";
const FEATURE_MARKDOWN_FILE = "feature.md";
const TARGET_MARKDOWN_FILE = "target.md";
const SOURCE_MARKDOWN_FILE = "source.md";
const BROKEN_MARKDOWN_FILE = "broken.md";
const BROKEN_MARKDOWN_EXTENSION_FILE = "broken.markdown";
const MISSING_MARKDOWN_SCOPE_FILE = "missing.md";
const UNRELATED_MARKDOWN_SCOPE_FILE = "notes.txt";
const GUIDE_DIRECTORY_NAME = "guides";
const MISSING_FIXTURE_DIAGNOSTIC = "Markdown validation scenario has no fixture";
const DOCS_DIRECT_FILE_MD024_CONTENT = "# Page\n\n## Repeat\n\n## Repeat\n";
const VALID_MARKDOWN_TARGET_CONTENT = "# Target\n\nContent.\n";
const VALID_MARKDOWN_SOURCE_CONTENT = "# Source\n\n[valid](./target.md)\n";
const BROKEN_MARKDOWN_CONTENT = "# Broken\n\n[broken](./does-not-exist.md)\n";
const UNRELATED_MARKDOWN_SCOPE_CONTENT = "plain text\n";
const MARKDOWN_HELP_FLAG = "--help";
const FILES_FLAG = "--files";
const EXPECTED_ZERO = 0;
const EXPECTED_ONE = 1;
const EXPECTED_TWO = 2;
const EXPECTED_THREE = 3;

export const MARKDOWN_TEST_SLICE = {
  UNIT: "unit",
  INTEGRATION: "integration",
  E2E: "e2e",
} as const;

export type MarkdownTestSlice = (typeof MARKDOWN_TEST_SLICE)[keyof typeof MARKDOWN_TEST_SLICE];

export const MARKDOWN_SCENARIO_KIND = {
  CLEAN_TREE: "cleanTree",
  DATA_URI_ALLOWED: "dataUriAllowed",
  BROKEN_LINKS: "brokenLinks",
  BROKEN_FRAGMENT: "brokenFragment",
  ERROR_SHAPE: "errorShape",
  PROJECT_ABSOLUTE_LINK: "projectAbsoluteLink",
  NO_SIDE_EFFECTS: "noSideEffects",
  DEFAULT_DIRECTORIES: "defaultDirectories",
  EXCLUDE_NODE: "excludeNode",
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
} as const;

export type MarkdownScenarioKind = (typeof MARKDOWN_SCENARIO_KIND)[keyof typeof MARKDOWN_SCENARIO_KIND];

export interface MarkdownValidationScenario {
  readonly title: string;
  readonly kind: MarkdownScenarioKind;
  readonly fixture?: MarkdownFixtureName;
  readonly timeout: number;
}

export const MARKDOWN_VALIDATION_DATA = {
  unitTempPrefix: MARKDOWN_UNIT_TEMP_PREFIX,
  e2eTempPrefix: MARKDOWN_E2E_TEMP_PREFIX,
  spxDirectoryName: SPX_DIRECTORY_NAME,
  docsDirectoryName: DOCS_DIRECTORY_NAME,
  featureDirectoryName: FEATURE_DIRECTORY_NAME,
  declaredNodeFragment: DECLARED_NODE_FRAGMENT,
  dataUriMarker: DATA_URI_MARKER,
  missingHeadingMarker: MISSING_HEADING_MARKER,
  missingFileMarker: MISSING_FILE_MARKER,
  md024RuleMarker: MD024_RULE_MARKER,
  childMarkdownFile: CHILD_MARKDOWN_FILE,
  featureMarkdownFile: FEATURE_MARKDOWN_FILE,
  targetMarkdownFile: TARGET_MARKDOWN_FILE,
  sourceMarkdownFile: SOURCE_MARKDOWN_FILE,
  brokenMarkdownFile: BROKEN_MARKDOWN_FILE,
  brokenMarkdownExtensionFile: BROKEN_MARKDOWN_EXTENSION_FILE,
  missingMarkdownScopeFile: MISSING_MARKDOWN_SCOPE_FILE,
  unrelatedMarkdownScopeFile: UNRELATED_MARKDOWN_SCOPE_FILE,
  guideDirectoryName: GUIDE_DIRECTORY_NAME,
  missingFixtureDiagnostic: MISSING_FIXTURE_DIAGNOSTIC,
  docsDirectFileMd024Content: DOCS_DIRECT_FILE_MD024_CONTENT,
  validMarkdownTargetContent: VALID_MARKDOWN_TARGET_CONTENT,
  validMarkdownSourceContent: VALID_MARKDOWN_SOURCE_CONTENT,
  brokenMarkdownContent: BROKEN_MARKDOWN_CONTENT,
  unrelatedMarkdownScopeContent: UNRELATED_MARKDOWN_SCOPE_CONTENT,
  helpFlag: MARKDOWN_HELP_FLAG,
  filesFlag: FILES_FLAG,
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
      fixture: MARKDOWN_FIXTURES.CLEAN_TREE,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "data URI images are ignored by relative-link validation",
      kind: MARKDOWN_SCENARIO_KIND.DATA_URI_ALLOWED,
      fixture: MARKDOWN_FIXTURES.CLEAN_TREE,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "broken markdown links are reported",
      kind: MARKDOWN_SCENARIO_KIND.BROKEN_LINKS,
      fixture: MARKDOWN_FIXTURES.BROKEN_LINKS,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "broken heading fragments are reported",
      kind: MARKDOWN_SCENARIO_KIND.BROKEN_FRAGMENT,
      fixture: MARKDOWN_FIXTURES.BROKEN_LINKS,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "markdown errors include file line and detail",
      kind: MARKDOWN_SCENARIO_KIND.ERROR_SHAPE,
      fixture: MARKDOWN_FIXTURES.BROKEN_LINKS,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "project absolute links resolve from project root",
      kind: MARKDOWN_SCENARIO_KIND.PROJECT_ABSOLUTE_LINK,
      fixture: MARKDOWN_FIXTURES.BROKEN_LINKS,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "validation does not create files in validated directories",
      kind: MARKDOWN_SCENARIO_KIND.NO_SIDE_EFFECTS,
      fixture: MARKDOWN_FIXTURES.CLEAN_TREE,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "default markdown directories are discovered",
      kind: MARKDOWN_SCENARIO_KIND.DEFAULT_DIRECTORIES,
      fixture: MARKDOWN_FIXTURES.CLEAN_TREE,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "excluded spec nodes are skipped",
      kind: MARKDOWN_SCENARIO_KIND.EXCLUDE_NODE,
      fixture: MARKDOWN_FIXTURES.WITH_EXCLUDE,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "duplicate heading policy is scoped by directory",
      kind: MARKDOWN_SCENARIO_KIND.DUPLICATE_HEADINGS,
      fixture: MARKDOWN_FIXTURES.DUPLICATE_HEADINGS,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "markdownlint config contains the curated rule set",
      kind: MARKDOWN_SCENARIO_KIND.CONFIG_BUILDER,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "directory targets recurse over md files only",
      kind: MARKDOWN_SCENARIO_KIND.DIRECTORY_SCOPE_MD_ONLY,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
  ];
}

export function markdownIntegrationScenarios(): MarkdownValidationScenario[] {
  return [
    {
      title: "default markdown command validates default directories",
      kind: MARKDOWN_SCENARIO_KIND.COMMAND_DEFAULTS,
      fixture: MARKDOWN_FIXTURES.BROKEN_LINKS,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "markdown command files scope can target docs only",
      kind: MARKDOWN_SCENARIO_KIND.FILE_SCOPE_DOCS,
      fixture: MARKDOWN_FIXTURES.BROKEN_LINKS,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "markdown command files scope accepts a clean spx directory",
      kind: MARKDOWN_SCENARIO_KIND.FILE_SCOPE_CLEAN_SPX,
      fixture: MARKDOWN_FIXTURES.CLEAN_TREE,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "markdown failure fails the full pipeline",
      kind: MARKDOWN_SCENARIO_KIND.PIPELINE_FAILURE,
      fixture: MARKDOWN_FIXTURES.BROKEN_LINKS,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "markdown command reports unrelated file scopes",
      kind: MARKDOWN_SCENARIO_KIND.UNRELATED_FILE_SCOPE_DIAGNOSTIC,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "markdown command reports missing file scopes",
      kind: MARKDOWN_SCENARIO_KIND.MISSING_FILE_SCOPE_DIAGNOSTIC,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "markdown command reports skipped file scopes while validating markdown scopes",
      kind: MARKDOWN_SCENARIO_KIND.MIXED_FILE_SCOPE_DIAGNOSTIC,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
  ];
}

export function markdownE2eScenarios(): MarkdownValidationScenario[] {
  return [
    {
      title: "markdown command help is registered",
      kind: MARKDOWN_SCENARIO_KIND.E2E_HELP,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "markdown command reports broken links from a directory scope",
      kind: MARKDOWN_SCENARIO_KIND.E2E_BROKEN_DIRECTORY,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "markdown command accepts valid directory scope",
      kind: MARKDOWN_SCENARIO_KIND.E2E_VALID_DIRECTORY,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "markdown command accepts direct markdown file scope",
      kind: MARKDOWN_SCENARIO_KIND.E2E_DIRECT_FILE,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
    {
      title: "markdown direct docs file scope keeps docs heading policy",
      kind: MARKDOWN_SCENARIO_KIND.DOCS_DIRECT_FILE_MD024,
      timeout: MARKDOWN_HARNESS_TIMEOUT,
    },
  ];
}
