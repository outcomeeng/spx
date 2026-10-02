import * as fc from "fast-check";
import { posix } from "node:path";

import { DECISION_SUFFIXES, NODE_SUFFIXES, SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import {
  MARKDOWN_CONFIG_CONTROL_KEYS,
  MARKDOWN_DEFAULT_DIRECTORY_NAMES,
  MARKDOWN_PRIMARY_FILE_EXTENSION,
  MARKDOWN_VALIDATION_TARGET_KIND,
  type MarkdownValidationTarget,
} from "@/validation/steps/markdown";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

const SPX_DIRECTORY_NAME = SPEC_TREE_CONFIG.ROOT_DIRECTORY;
const [, DOCS_DIRECTORY_NAME] = MARKDOWN_DEFAULT_DIRECTORY_NAMES;
const SAMPLE_DIRECTORY_NAME = "21-sample.outcome";
const DECLARED_NODE_FRAGMENT = "32-declared";
const DECLARED_NODE_DIRECTORY = "32-declared.outcome";
const DECLARED_MARKDOWN_FILE = "declared.md";
const DECLARED_MARKDOWN_EXTENSION_FILE = "declared.markdown";
const DECLARED_CHILD_DIRECTORY = "43-child.enabler";
const DATA_URI_MARKER = "data:";
const MISSING_HEADING_MARKER = "nonexistent-heading";
const MISSING_FILE_MARKER = "does-not-exist";
const MD024_RULE_MARKER = MARKDOWN_CONFIG_CONTROL_KEYS.DUPLICATE_HEADINGS;
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

/** Bounds of the generated link-grammar domain. */
const SPEC_TREE_LINK_DOMAIN = {
  /** Two-digit node index range the methodology's sibling index space admits. */
  NODE_INDEX_MIN: 10,
  NODE_INDEX_MAX: 99,
  WORD_MIN_LENGTH: 3,
  WORD_MAX_LENGTH: 8,
  ANCESTOR_MAX_COUNT: 2,
  FILLER_PARAGRAPH_MAX_COUNT: 3,
  PHRASE_MIN_WORDS: 1,
  PHRASE_MAX_WORDS: 4,
  /** Distinct names one scenario draws: local, docs, and outside directories; citing, target, and missing stems; host; link text. */
  NAME_COUNT: 8,
} as const;

const LOWERCASE_LETTERS = [..."abcdefghijklmnopqrstuvwxyz"];
const MARKDOWN_LINE_SEPARATOR = "\n";
const MARKDOWN_HEADING_PREFIX = "# ";
const MARKDOWN_FENCE = "```";
const MARKDOWN_FENCE_INFO = "text";
const PARENT_DIRECTORY_SEGMENT = "..";
const CURRENT_DIRECTORY_PREFIX = "./";
const PRODUCT_ROOT_ANCHOR = "/";
const EXTERNAL_URL_SCHEME = "https://";
const EXTERNAL_RESERVED_DOMAIN = ".invalid";
const SENTENCE_END = ".";
const WORD_SEPARATOR = " ";

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

/** A product-relative markdown file a case writes beside its citing file. */
export interface MarkdownSupportingFile {
  readonly path: string;
  readonly content: string;
}

/** A citing file together with every file that must exist for its link to name an existing target. */
export interface MarkdownLinkShapeCase {
  readonly link: MarkdownLinkCase;
  readonly supportingFiles: readonly MarkdownSupportingFile[];
}

/** A link that names an existing file, with that file's product-relative path and content. */
export interface MarkdownLinkTargetCase {
  readonly link: MarkdownLinkCase;
  /** Product-relative path of the file the link names. */
  readonly targetFile: string;
  readonly targetContent: string;
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
  readonly targetContent: string;
}

/** Generated prose that surrounds a link or path inside a markdown document. */
interface MarkdownProse {
  readonly title: string;
  readonly fillerParagraphs: readonly string[];
  readonly lead: string;
}

/**
 * One coherent spec-tree link scenario: a node directory under generated
 * ancestors, a child node inside it, a decision record beside it, and the
 * generated file, directory, and prose names every link case composes.
 */
export interface SpecTreeLinkScenario {
  /** Product-relative directory of the citing node, under the spec-tree root. */
  readonly nodeDirectory: string;
  /** Directory name of the citing node. */
  readonly nodeSegment: string;
  /** Directory name of a node inside the citing node. */
  readonly childNodeSegment: string;
  /** File name of a decision record inside the citing node. */
  readonly decisionFile: string;
  /** Non-node directory inside the citing node that node-local links enter. */
  readonly localDirectory: string;
  /** Subdirectory of the docs directory that holds docs citing files. */
  readonly docsSubdirectory: string;
  /** Product-root directory outside the default markdown directories. */
  readonly outsideDirectory: string;
  readonly citingFileName: string;
  readonly targetFileName: string;
  readonly missingFileName: string;
  readonly externalHost: string;
  readonly linkText: string;
  readonly citingProse: MarkdownProse;
  readonly targetProse: MarkdownProse;
}

function arbitraryWord(): fc.Arbitrary<string> {
  return fc.string({
    unit: fc.constantFrom(...LOWERCASE_LETTERS),
    minLength: SPEC_TREE_LINK_DOMAIN.WORD_MIN_LENGTH,
    maxLength: SPEC_TREE_LINK_DOMAIN.WORD_MAX_LENGTH,
  });
}

function arbitraryPhrase(): fc.Arbitrary<string> {
  return fc
    .array(arbitraryWord(), {
      minLength: SPEC_TREE_LINK_DOMAIN.PHRASE_MIN_WORDS,
      maxLength: SPEC_TREE_LINK_DOMAIN.PHRASE_MAX_WORDS,
    })
    .map((words) => words.join(WORD_SEPARATOR));
}

function arbitraryProse(): fc.Arbitrary<MarkdownProse> {
  return fc.record({
    title: arbitraryPhrase(),
    fillerParagraphs: fc.array(arbitraryPhrase(), { maxLength: SPEC_TREE_LINK_DOMAIN.FILLER_PARAGRAPH_MAX_COUNT }),
    lead: arbitraryPhrase(),
  });
}

function arbitraryIndexedName(suffixes: readonly string[]): fc.Arbitrary<string> {
  return fc
    .record({
      index: fc.integer({ min: SPEC_TREE_LINK_DOMAIN.NODE_INDEX_MIN, max: SPEC_TREE_LINK_DOMAIN.NODE_INDEX_MAX }),
      slug: arbitraryWord(),
      suffix: fc.constantFrom(...suffixes),
    })
    .map(({ index, slug, suffix }) => `${index}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${suffix}`);
}

function markdownFileName(stem: string): string {
  return `${stem}${MARKDOWN_PRIMARY_FILE_EXTENSION}`;
}

/** Generates coherent spec-tree link scenarios whose names vary over node indices, slugs, kinds, and file stems. */
export function arbitrarySpecTreeLinkScenario(): fc.Arbitrary<SpecTreeLinkScenario> {
  return fc
    .record({
      ancestors: fc.array(arbitraryIndexedName(NODE_SUFFIXES), {
        maxLength: SPEC_TREE_LINK_DOMAIN.ANCESTOR_MAX_COUNT,
      }),
      nodeSegment: arbitraryIndexedName(NODE_SUFFIXES),
      childNodeSegment: arbitraryIndexedName(NODE_SUFFIXES),
      decisionFile: arbitraryIndexedName(DECISION_SUFFIXES),
      names: fc.uniqueArray(arbitraryWord(), {
        minLength: SPEC_TREE_LINK_DOMAIN.NAME_COUNT,
        maxLength: SPEC_TREE_LINK_DOMAIN.NAME_COUNT,
      }),
      citingProse: arbitraryProse(),
      targetProse: arbitraryProse(),
    })
    .filter(({ names }) =>
      !names.some((name) => (MARKDOWN_DEFAULT_DIRECTORY_NAMES as readonly string[]).includes(name))
    )
    .map(({ ancestors, nodeSegment, childNodeSegment, decisionFile, names, citingProse, targetProse }) => {
      const [
        localDirectory = "",
        docsSubdirectory = "",
        outsideDirectory = "",
        citingStem = "",
        targetStem = "",
        missingStem = "",
        externalHost = "",
        linkText = "",
      ] = names;
      return {
        nodeDirectory: posix.join(SPEC_TREE_CONFIG.ROOT_DIRECTORY, ...ancestors, nodeSegment),
        nodeSegment,
        childNodeSegment,
        decisionFile,
        localDirectory,
        docsSubdirectory,
        outsideDirectory,
        citingFileName: markdownFileName(citingStem),
        targetFileName: markdownFileName(targetStem),
        missingFileName: markdownFileName(missingStem),
        externalHost,
        linkText,
        citingProse,
        targetProse,
      };
    });
}

/**
 * Builds a markdown document — a heading, the generated filler paragraphs, then
 * the body lines — and the 1-based line of the body line at `markedOffset`.
 */
function markdownDocument(
  prose: MarkdownProse,
  bodyLines: readonly string[],
  markedOffset: number,
): { readonly content: string; readonly line: number } {
  const leadingLines = [
    `${MARKDOWN_HEADING_PREFIX}${prose.title}`,
    "",
    ...prose.fillerParagraphs.flatMap((paragraph) => [paragraph, ""]),
  ];
  return {
    content: [...leadingLines, ...bodyLines].join(MARKDOWN_LINE_SEPARATOR) + MARKDOWN_LINE_SEPARATOR,
    line: leadingLines.length + markedOffset + 1,
  };
}

function markdownLinkingTo(scenario: SpecTreeLinkScenario, citingFile: string, href: string): MarkdownLinkCase {
  return {
    citingFile,
    href,
    ...markdownDocument(scenario.citingProse, [`${scenario.linkText} [${scenario.linkText}](${href})`], 0),
  };
}

function targetContent(scenario: SpecTreeLinkScenario): string {
  return markdownDocument(scenario.targetProse, [scenario.targetProse.lead], 0).content;
}

function specTreeCitingFile(scenario: SpecTreeLinkScenario): string {
  return posix.join(scenario.nodeDirectory, scenario.citingFileName);
}

function docsCitingFile(scenario: SpecTreeLinkScenario): string {
  const [, docsDirectory] = MARKDOWN_DEFAULT_DIRECTORY_NAMES;
  return posix.join(docsDirectory, scenario.docsSubdirectory, scenario.citingFileName);
}

function linkedFile(scenario: SpecTreeLinkScenario): string {
  return posix.join(scenario.nodeDirectory, scenario.targetFileName);
}

function decisionPath(scenario: SpecTreeLinkScenario): string {
  return posix.join(scenario.nodeDirectory, scenario.decisionFile);
}

/** Resolves an href from the product root: a leading slash anchors at the root, and a bare path starts there. */
function resolveFromProductRoot(href: string): string {
  return posix.normalize(href.replace(/^\/+/, ""));
}

/** Resolves an href from the directory of the citing file. */
function resolveFromCitingDirectory(citingFile: string, href: string): string {
  return posix.normalize(posix.join(posix.dirname(citingFile), href.replace(/^\/+/, "")));
}

/** A tree-absolute link from a spec-tree file to an existing file in the same node. */
export function specTreeTreeAbsoluteLink(scenario: SpecTreeLinkScenario): MarkdownLinkShapeCase {
  return {
    link: markdownLinkingTo(scenario, specTreeCitingFile(scenario), linkedFile(scenario)),
    supportingFiles: [{ path: linkedFile(scenario), content: targetContent(scenario) }],
  };
}

/**
 * The link shapes the spec rejects inside `spx/` — a `../` climb, a
 * leading-slash anchor, and a relative path into a descendant node's
 * directory — each naming a file that exists.
 */
export function specTreeRejectedShapeLinks(scenario: SpecTreeLinkScenario): readonly MarkdownLinkShapeCase[] {
  const citingFile = specTreeCitingFile(scenario);
  const descendantTarget = posix.join(scenario.childNodeSegment, scenario.targetFileName);
  const supportingFiles = [
    { path: linkedFile(scenario), content: targetContent(scenario) },
    { path: posix.join(scenario.nodeDirectory, descendantTarget), content: targetContent(scenario) },
  ];
  return [
    posix.join(PARENT_DIRECTORY_SEGMENT, scenario.nodeSegment, scenario.targetFileName),
    `${PRODUCT_ROOT_ANCHOR}${linkedFile(scenario)}`,
    descendantTarget,
  ].map((href) => ({ link: markdownLinkingTo(scenario, citingFile, href), supportingFiles }));
}

/** Admitted link shapes inside `spx/` — tree-absolute and node-local — that name no file. */
export function specTreeMissingTargetLinks(scenario: SpecTreeLinkScenario): readonly MarkdownLinkCase[] {
  const citingFile = specTreeCitingFile(scenario);
  return [
    posix.join(scenario.nodeDirectory, scenario.missingFileName),
    posix.join(scenario.localDirectory, scenario.missingFileName),
  ].map((href) => markdownLinkingTo(scenario, citingFile, href));
}

/** Admitted link shapes inside `spx/` — tree-absolute and node-local — with the file each names. */
export function specTreeExistingTargetLinks(scenario: SpecTreeLinkScenario): readonly MarkdownLinkTargetCase[] {
  const citingFile = specTreeCitingFile(scenario);
  const nodeLocalHref = posix.join(scenario.localDirectory, scenario.targetFileName);
  return [
    { href: linkedFile(scenario), targetFile: linkedFile(scenario) },
    { href: nodeLocalHref, targetFile: posix.join(scenario.nodeDirectory, nodeLocalHref) },
  ].map(({ href, targetFile }) => ({
    link: markdownLinkingTo(scenario, citingFile, href),
    targetFile,
    targetContent: targetContent(scenario),
  }));
}

/** A relative link to a missing file from a citing file inside the given product-relative directory. */
export function markdownBrokenRelativeLink(scenario: SpecTreeLinkScenario, directory: string): MarkdownLinkCase {
  return markdownLinkingTo(
    scenario,
    posix.join(directory, scenario.citingFileName),
    `${CURRENT_DIRECTORY_PREFIX}${scenario.missingFileName}`,
  );
}

function resolutionRow(
  scenario: SpecTreeLinkScenario,
  directory: string,
  link: MarkdownLinkCase,
  declaredFromProductRoot: boolean,
): MarkdownLinkResolutionRow {
  const fromRoot = resolveFromProductRoot(link.href);
  const fromCitingDirectory = resolveFromCitingDirectory(link.citingFile, link.href);
  return {
    directory,
    link,
    declaredResolution: declaredFromProductRoot ? fromRoot : fromCitingDirectory,
    otherResolution: declaredFromProductRoot ? fromCitingDirectory : fromRoot,
    targetContent: targetContent(scenario),
  };
}

/** Command-level resolution: tree-absolute in `spx/` and product-absolute in `docs/` resolve from the product root. */
export function markdownCommandResolutionRows(scenario: SpecTreeLinkScenario): readonly MarkdownLinkResolutionRow[] {
  const [specTreeDirectory, docsDirectory] = MARKDOWN_DEFAULT_DIRECTORY_NAMES;
  return [
    resolutionRow(
      scenario,
      specTreeDirectory,
      markdownLinkingTo(scenario, specTreeCitingFile(scenario), linkedFile(scenario)),
      true,
    ),
    resolutionRow(
      scenario,
      docsDirectory,
      markdownLinkingTo(scenario, docsCitingFile(scenario), `${PRODUCT_ROOT_ANCHOR}${linkedFile(scenario)}`),
      true,
    ),
  ];
}

/** Rule-level resolution: node-local in `spx/` and relative in `docs/` resolve from the citing file's directory. */
export function markdownRuleResolutionRows(scenario: SpecTreeLinkScenario): readonly MarkdownLinkResolutionRow[] {
  const [specTreeDirectory, docsDirectory] = MARKDOWN_DEFAULT_DIRECTORY_NAMES;
  return [
    resolutionRow(
      scenario,
      specTreeDirectory,
      markdownLinkingTo(
        scenario,
        specTreeCitingFile(scenario),
        posix.join(scenario.localDirectory, scenario.targetFileName),
      ),
      false,
    ),
    resolutionRow(
      scenario,
      docsDirectory,
      markdownLinkingTo(scenario, docsCitingFile(scenario), `${CURRENT_DIRECTORY_PREFIX}${scenario.targetFileName}`),
      false,
    ),
  ];
}

/** Links the rule never checks — an external URL and an HTML link, each naming no file — in each default directory. */
export function markdownUncheckedLinks(scenario: SpecTreeLinkScenario): readonly MarkdownLinkCase[] {
  const externalHref =
    `${EXTERNAL_URL_SCHEME}${scenario.externalHost}${EXTERNAL_RESERVED_DOMAIN}/${scenario.missingFileName}`;
  const htmlHref = `${CURRENT_DIRECTORY_PREFIX}${scenario.missingFileName}`;
  return [specTreeCitingFile(scenario), docsCitingFile(scenario)].flatMap((citingFile) => [
    markdownLinkingTo(scenario, citingFile, externalHref),
    {
      citingFile,
      href: htmlHref,
      ...markdownDocument(
        scenario.citingProse,
        [`${scenario.linkText} <a href="${htmlHref}">${scenario.linkText}</a>`],
        0,
      ),
    },
  ]);
}

function decisionPathCase(scenario: SpecTreeLinkScenario, link: MarkdownLinkCase): MarkdownLinkShapeCase {
  return {
    link,
    supportingFiles: [{ path: decisionPath(scenario), content: targetContent(scenario) }],
  };
}

/** A decision path written as text outside a link: bare, and inside an inline code span. */
export function specTreeDecisionPathTextCases(scenario: SpecTreeLinkScenario): readonly MarkdownLinkShapeCase[] {
  const path = decisionPath(scenario);
  return [path, `\`${path}\``].map((written) =>
    decisionPathCase(scenario, {
      citingFile: specTreeCitingFile(scenario),
      href: path,
      ...markdownDocument(scenario.citingProse, [`${scenario.citingProse.lead} ${written}${SENTENCE_END}`], 0),
    })
  );
}

/** A decision path inside a fenced code block, and the same path as a tree-absolute link. */
export function specTreeDecisionPathAdmittedCases(scenario: SpecTreeLinkScenario): readonly MarkdownLinkShapeCase[] {
  const path = decisionPath(scenario);
  const citingFile = specTreeCitingFile(scenario);
  return [
    decisionPathCase(scenario, {
      citingFile,
      href: path,
      ...markdownDocument(
        scenario.citingProse,
        [`${MARKDOWN_FENCE}${MARKDOWN_FENCE_INFO}`, path, MARKDOWN_FENCE],
        1,
      ),
    }),
    decisionPathCase(scenario, markdownLinkingTo(scenario, citingFile, path)),
  ];
}
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
