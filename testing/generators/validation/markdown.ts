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

const LINK_SHAPE_DECISION_FILE = "15-sample.adr.md";
const LINK_SHAPE_NODE_LOCAL_DIRECTORY = "tests";
const LINK_SHAPE_EXTERNAL_HREF = "https://example.invalid/does-not-exist.md";
const LINK_SHAPE_HTML_HREF = "./does-not-exist.md";
const LINK_SHAPE_CLIMB_SEGMENT = "..";
const LINK_SHAPE_PRODUCT_ABSOLUTE_PREFIX = "/";
const LINK_SHAPE_DECISION_CONTENT = "# Sample Decision\n\nThe decision.\n";

/** One markdown file whose single link or path occupies a known line. */
export interface MarkdownLinkCase {
  /** Product-relative path of the citing markdown file. */
  readonly citingFile: string;
  /** The href or path text the citing file carries. */
  readonly href: string;
  /** Complete content of the citing file. */
  readonly content: string;
  /** 1-based line carrying the href or path text. */
  readonly line: number;
}

/** A link whose resolution base the spec declares, with the file each base would resolve it to. */
export interface MarkdownLinkResolutionRow {
  /** Default directory the citing file lives in. */
  readonly directory: string;
  readonly link: MarkdownLinkCase;
  /** Product-relative file the link names when resolved from the declared base. */
  readonly declaredResolution: string;
  /** Product-relative file the link names when resolved from the other base. */
  readonly otherResolution: string;
}

function markdownLinkCase(citingFile: string, href: string, content: string): MarkdownLinkCase {
  return { citingFile, href, content, line: lineContaining(content, href) };
}

function markdownLinkingTo(citingFile: string, href: string): MarkdownLinkCase {
  return markdownLinkCase(citingFile, href, `# Source\n\n[link](${href})\n`);
}

/** Resolves an href from the product root: a leading slash anchors at the root, and a bare path starts there. */
function resolveFromProductRoot(href: string): string {
  return posix.normalize(href.replace(/^\/+/, ""));
}

/** Resolves an href from the directory of the citing file. */
function resolveFromCitingDirectory(citingFile: string, href: string): string {
  return posix.normalize(posix.join(posix.dirname(citingFile), href.replace(/^\/+/, "")));
}

const LINK_SHAPE_NODE_DIRECTORY = posix.join(SPX_DIRECTORY_NAME, SAMPLE_DIRECTORY_NAME);
const LINK_SHAPE_CITING_FILE = posix.join(LINK_SHAPE_NODE_DIRECTORY, SAMPLE_MARKDOWN_FILE);
const LINK_SHAPE_LINKED_FILE = posix.join(LINK_SHAPE_NODE_DIRECTORY, TARGET_MARKDOWN_FILE);
const LINK_SHAPE_DESCENDANT_LINKED_FILE = posix.join(
  LINK_SHAPE_NODE_DIRECTORY,
  DECLARED_CHILD_DIRECTORY,
  TARGET_MARKDOWN_FILE,
);
const LINK_SHAPE_NODE_LOCAL_HREF = posix.join(LINK_SHAPE_NODE_LOCAL_DIRECTORY, TARGET_MARKDOWN_FILE);
const LINK_SHAPE_DECISION_PATH = posix.join(LINK_SHAPE_NODE_DIRECTORY, LINK_SHAPE_DECISION_FILE);
const LINK_SHAPE_DOCS_CITING_FILE = posix.join(DOCS_DIRECTORY_NAME, GUIDE_DIRECTORY_NAME, SOURCE_MARKDOWN_FILE);
const LINK_SHAPE_DOCS_RELATIVE_HREF = `./${TARGET_MARKDOWN_FILE}`;
const LINK_SHAPE_TREE_ABSOLUTE_HREF = LINK_SHAPE_LINKED_FILE;
const LINK_SHAPE_PRODUCT_ABSOLUTE_HREF = `${LINK_SHAPE_PRODUCT_ABSOLUTE_PREFIX}${LINK_SHAPE_LINKED_FILE}`;

/** The resolution base the spec declares for a link type. */
const LINK_RESOLUTION_BASE = {
  PRODUCT_ROOT: "productRoot",
  CITING_DIRECTORY: "citingDirectory",
} as const;

type LinkResolutionBase = (typeof LINK_RESOLUTION_BASE)[keyof typeof LINK_RESOLUTION_BASE];

function linkResolutionRow(
  directory: string,
  link: MarkdownLinkCase,
  base: LinkResolutionBase,
): MarkdownLinkResolutionRow {
  const fromRoot = resolveFromProductRoot(link.href);
  const fromCitingDirectory = resolveFromCitingDirectory(link.citingFile, link.href);
  const fromProductRoot = base === LINK_RESOLUTION_BASE.PRODUCT_ROOT;
  return {
    directory,
    link,
    declaredResolution: fromProductRoot ? fromRoot : fromCitingDirectory,
    otherResolution: fromProductRoot ? fromCitingDirectory : fromRoot,
  };
}

/**
 * Link-shape cases for the methodology link grammar inside `spx/` and the
 * link forms `docs/` keeps, each drawn from the markdown validation spec.
 */
export const MARKDOWN_LINK_SHAPE_DATA = {
  specTreeDirectoryName: SPX_DIRECTORY_NAME,
  docsDirectoryName: DOCS_DIRECTORY_NAME,
  citingFile: LINK_SHAPE_CITING_FILE,
  linkedFile: LINK_SHAPE_LINKED_FILE,
  descendantLinkedFile: LINK_SHAPE_DESCENDANT_LINKED_FILE,
  linkedContent: VALID_MARKDOWN_TARGET_CONTENT,
  /** A tree-absolute link from a spec-tree file to an existing file in the same node. */
  treeAbsoluteLink: markdownLinkingTo(LINK_SHAPE_CITING_FILE, LINK_SHAPE_TREE_ABSOLUTE_HREF),
  /** Link shapes the spec rejects inside `spx/`, each naming an existing file. */
  rejectedShapeLinks: [
    markdownLinkingTo(
      LINK_SHAPE_CITING_FILE,
      posix.join(LINK_SHAPE_CLIMB_SEGMENT, SAMPLE_DIRECTORY_NAME, TARGET_MARKDOWN_FILE),
    ),
    markdownLinkingTo(LINK_SHAPE_CITING_FILE, LINK_SHAPE_PRODUCT_ABSOLUTE_HREF),
    markdownLinkingTo(LINK_SHAPE_CITING_FILE, posix.join(DECLARED_CHILD_DIRECTORY, TARGET_MARKDOWN_FILE)),
  ],
  /** Admitted link shapes inside `spx/` that name no file. */
  missingTargetLinks: [
    markdownLinkingTo(
      LINK_SHAPE_CITING_FILE,
      posix.join(LINK_SHAPE_NODE_DIRECTORY, `${MISSING_FILE_MARKER}${MARKDOWN_PRIMARY_FILE_EXTENSION}`),
    ),
    markdownLinkingTo(
      LINK_SHAPE_CITING_FILE,
      posix.join(LINK_SHAPE_NODE_LOCAL_DIRECTORY, `${MISSING_FILE_MARKER}${MARKDOWN_PRIMARY_FILE_EXTENSION}`),
    ),
  ],
  /** Command-level resolution: tree-absolute in `spx/` and product-absolute in `docs/` resolve from the product root. */
  commandResolutionRows: [
    linkResolutionRow(
      SPX_DIRECTORY_NAME,
      markdownLinkingTo(LINK_SHAPE_CITING_FILE, LINK_SHAPE_TREE_ABSOLUTE_HREF),
      LINK_RESOLUTION_BASE.PRODUCT_ROOT,
    ),
    linkResolutionRow(
      DOCS_DIRECTORY_NAME,
      markdownLinkingTo(LINK_SHAPE_DOCS_CITING_FILE, LINK_SHAPE_PRODUCT_ABSOLUTE_HREF),
      LINK_RESOLUTION_BASE.PRODUCT_ROOT,
    ),
  ],
  /** Rule-level resolution: node-local in `spx/` and relative in `docs/` resolve from the citing file's directory. */
  ruleResolutionRows: [
    linkResolutionRow(
      SPX_DIRECTORY_NAME,
      markdownLinkingTo(LINK_SHAPE_CITING_FILE, LINK_SHAPE_NODE_LOCAL_HREF),
      LINK_RESOLUTION_BASE.CITING_DIRECTORY,
    ),
    linkResolutionRow(
      DOCS_DIRECTORY_NAME,
      markdownLinkingTo(LINK_SHAPE_DOCS_CITING_FILE, LINK_SHAPE_DOCS_RELATIVE_HREF),
      LINK_RESOLUTION_BASE.CITING_DIRECTORY,
    ),
  ],
  /** Links the rule never checks — an external URL and an HTML link — in each default directory. */
  uncheckedLinks: [LINK_SHAPE_CITING_FILE, LINK_SHAPE_DOCS_CITING_FILE].flatMap((citingFile) => [
    markdownLinkingTo(citingFile, LINK_SHAPE_EXTERNAL_HREF),
    markdownLinkCase(citingFile, LINK_SHAPE_HTML_HREF, `# Source\n\n<a href="${LINK_SHAPE_HTML_HREF}">link</a>\n`),
  ]),
  decisionFile: LINK_SHAPE_DECISION_PATH,
  decisionContent: LINK_SHAPE_DECISION_CONTENT,
  /** A decision path written as text outside a link: bare, and inside an inline code span. */
  decisionPathTextCases: [
    markdownLinkCase(
      LINK_SHAPE_CITING_FILE,
      LINK_SHAPE_DECISION_PATH,
      `# Source\n\nThe rule lives in ${LINK_SHAPE_DECISION_PATH}.\n`,
    ),
    markdownLinkCase(
      LINK_SHAPE_CITING_FILE,
      LINK_SHAPE_DECISION_PATH,
      `# Source\n\nThe rule lives in \`${LINK_SHAPE_DECISION_PATH}\`.\n`,
    ),
  ],
  /** A decision path inside a fenced code block, and the same path as a tree-absolute link. */
  decisionPathAdmittedCases: [
    markdownLinkCase(
      LINK_SHAPE_CITING_FILE,
      LINK_SHAPE_DECISION_PATH,
      `# Source\n\n\`\`\`text\n${LINK_SHAPE_DECISION_PATH}\n\`\`\`\n`,
    ),
    markdownLinkingTo(LINK_SHAPE_CITING_FILE, LINK_SHAPE_DECISION_PATH),
  ],
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
