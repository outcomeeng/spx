import * as fc from "fast-check";
import { posix } from "node:path";

import { DECISION_SUFFIXES, NODE_SUFFIXES, SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import {
  MARKDOWN_DEFAULT_DIRECTORY_NAMES,
  MARKDOWN_PRIMARY_FILE_EXTENSION,
  MARKDOWN_VALIDATION_TARGET_KIND,
  type MarkdownValidationTarget,
} from "@/validation/steps/markdown";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

const SPX_DIRECTORY_NAME = SPEC_TREE_CONFIG.ROOT_DIRECTORY;
const [, DOCS_DIRECTORY_NAME] = MARKDOWN_DEFAULT_DIRECTORY_NAMES;
const DECLARED_NODE_DIRECTORY = "32-declared.outcome";
const DECLARED_MARKDOWN_FILE = "declared.md";
const DECLARED_CHILD_DIRECTORY = "43-child.enabler";
const CHILD_MARKDOWN_FILE = "child.md";
const TARGET_MARKDOWN_FILE = "target.md";
const BROKEN_MARKDOWN_FILE = "broken.md";
const DOCS_DIRECT_FILE_MD024_CONTENT = "# Page\n\n## Repeat\n\n## Repeat\n";
const VALID_MARKDOWN_TARGET_CONTENT = "# Target\n\nContent.\n";
const BROKEN_MARKDOWN_CONTENT = "# Broken\n\n[broken](./does-not-exist.md)\n";

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

export const MARKDOWN_VALIDATION_DATA = {
  spxDirectoryName: SPX_DIRECTORY_NAME,
  docsDirectoryName: DOCS_DIRECTORY_NAME,
  declaredNodeDirectory: DECLARED_NODE_DIRECTORY,
  declaredMarkdownFile: DECLARED_MARKDOWN_FILE,
  declaredChildDirectory: DECLARED_CHILD_DIRECTORY,
  childMarkdownFile: CHILD_MARKDOWN_FILE,
  targetMarkdownFile: TARGET_MARKDOWN_FILE,
  brokenMarkdownFile: BROKEN_MARKDOWN_FILE,
  docsDirectFileMd024Content: DOCS_DIRECT_FILE_MD024_CONTENT,
  validMarkdownTargetContent: VALID_MARKDOWN_TARGET_CONTENT,
  brokenMarkdownContent: BROKEN_MARKDOWN_CONTENT,
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
  /**
   * Distinct names one scenario draws: local, docs, and outside directories; citing, target, missing, and
   * source stems; host; link text; a repeated heading and two section headings; a file-name qualifier; and a
   * non-markdown extension.
   */
  NAME_COUNT: 14,
} as const;

const LOWERCASE_LETTERS = [..."abcdefghijklmnopqrstuvwxyz"];
const MARKDOWN_LINE_SEPARATOR = "\n";
const MARKDOWN_HEADING_PREFIX = "# ";
const MARKDOWN_FENCE = "```";
const MARKDOWN_FENCE_INFO = "text";
const MARKDOWN_SECTION_PREFIX = "## ";
const MARKDOWN_SUBSECTION_PREFIX = "### ";
/** The secondary markdown extension the spec names; directory scope admits only the primary one. */
const MARKDOWN_SECONDARY_FILE_EXTENSION = ".markdown";
/** The character the spec names inside a markdown file path. */
const FILE_NAME_COLON = ":";
const FILE_EXTENSION_SEPARATOR = ".";
const FRAGMENT_SEPARATOR = "#";
/** GitHub heading anchors join the lowercased heading words with hyphens. */
const HEADING_ANCHOR_WORD_SEPARATOR = "-";
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
  readonly citingStem: string;
  readonly citingFileName: string;
  readonly targetFileName: string;
  readonly missingFileName: string;
  /** File name of the citing file of a valid link pair. */
  readonly sourceFileName: string;
  readonly externalHost: string;
  readonly linkText: string;
  /** Heading text a document repeats. */
  readonly repeatedHeading: string;
  /** Two distinct section headings that each parent the repeated heading. */
  readonly sectionHeadings: readonly [string, string];
  /** Word joined to the citing stem by a colon. */
  readonly fileNameQualifier: string;
  /** Extension, without its separator, of a file that is not markdown. */
  readonly unrelatedExtension: string;
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
      !names.some((name) =>
        (MARKDOWN_DEFAULT_DIRECTORY_NAMES as readonly string[]).includes(name)
        || `${FILE_EXTENSION_SEPARATOR}${name}` === MARKDOWN_SECONDARY_FILE_EXTENSION
      )
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
        sourceStem = "",
        repeatedHeading = "",
        firstSection = "",
        secondSection = "",
        fileNameQualifier = "",
        unrelatedExtension = "",
      ] = names;
      return {
        nodeDirectory: posix.join(SPEC_TREE_CONFIG.ROOT_DIRECTORY, ...ancestors, nodeSegment),
        nodeSegment,
        childNodeSegment,
        decisionFile,
        localDirectory,
        docsSubdirectory,
        outsideDirectory,
        citingStem,
        citingFileName: markdownFileName(citingStem),
        targetFileName: markdownFileName(targetStem),
        missingFileName: markdownFileName(missingStem),
        sourceFileName: markdownFileName(sourceStem),
        externalHost,
        linkText,
        repeatedHeading,
        sectionHeadings: [firstSection, secondSection] as const,
        fileNameQualifier,
        unrelatedExtension,
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

function brokenRelativeLinkFrom(scenario: SpecTreeLinkScenario, citingFile: string): MarkdownLinkCase {
  return markdownLinkingTo(scenario, citingFile, `${CURRENT_DIRECTORY_PREFIX}${scenario.missingFileName}`);
}

/** A relative link to a missing file from a citing file inside the given product-relative directory. */
export function markdownBrokenRelativeLink(scenario: SpecTreeLinkScenario, directory: string): MarkdownLinkCase {
  return brokenRelativeLinkFrom(scenario, posix.join(directory, scenario.citingFileName));
}

/** The same broken relative link from a citing file carrying the secondary markdown extension. */
export function markdownSecondaryExtensionBrokenLink(
  scenario: SpecTreeLinkScenario,
  directory: string,
): MarkdownLinkCase {
  return brokenRelativeLinkFrom(
    scenario,
    posix.join(directory, `${scenario.citingStem}${MARKDOWN_SECONDARY_FILE_EXTENSION}`),
  );
}

/** The same broken relative link from a citing file whose name contains a colon. */
export function markdownColonNamedBrokenLink(scenario: SpecTreeLinkScenario, directory: string): MarkdownLinkCase {
  return brokenRelativeLinkFrom(
    scenario,
    posix.join(
      directory,
      markdownFileName(`${scenario.citingStem}${FILE_NAME_COLON}${scenario.fileNameQualifier}`),
    ),
  );
}

function targetBeside(scenario: SpecTreeLinkScenario, directory: string): MarkdownSupportingFile {
  return { path: posix.join(directory, scenario.targetFileName), content: targetContent(scenario) };
}

function relativeLinkToTarget(
  scenario: SpecTreeLinkScenario,
  directory: string,
  fragment: string,
): MarkdownLinkShapeCase {
  return {
    link: markdownLinkingTo(
      scenario,
      posix.join(directory, scenario.sourceFileName),
      `${CURRENT_DIRECTORY_PREFIX}${scenario.targetFileName}${fragment}`,
    ),
    supportingFiles: [targetBeside(scenario, directory)],
  };
}

/** A relative link to an existing file beside the citing file inside the given product-relative directory. */
export function markdownValidRelativeLink(scenario: SpecTreeLinkScenario, directory: string): MarkdownLinkShapeCase {
  return relativeLinkToTarget(scenario, directory, "");
}

/** The anchor GitHub derives for a heading of lowercase words. */
function headingAnchor(heading: string): string {
  return heading.split(WORD_SEPARATOR).join(HEADING_ANCHOR_WORD_SEPARATOR);
}

/** A relative link whose fragment names the heading the linked file carries. */
export function markdownValidFragmentLink(scenario: SpecTreeLinkScenario, directory: string): MarkdownLinkShapeCase {
  return relativeLinkToTarget(
    scenario,
    directory,
    `${FRAGMENT_SEPARATOR}${headingAnchor(scenario.targetProse.title)}`,
  );
}

/** A relative link whose fragment extends the linked file's only heading anchor, so it names no heading. */
export function markdownMissingFragmentLink(
  scenario: SpecTreeLinkScenario,
  directory: string,
): MarkdownLinkShapeCase {
  return relativeLinkToTarget(
    scenario,
    directory,
    [
      FRAGMENT_SEPARATOR,
      headingAnchor(scenario.targetProse.title),
      HEADING_ANCHOR_WORD_SEPARATOR,
      scenario.fileNameQualifier,
    ].join(""),
  );
}

function sectionLines(prefix: string, heading: string, lead: string): readonly string[] {
  return [`${prefix}${heading}`, "", lead];
}

function duplicateSiblingHeadingLines(scenario: SpecTreeLinkScenario): readonly string[] {
  const section = sectionLines(MARKDOWN_SECTION_PREFIX, scenario.repeatedHeading, scenario.citingProse.lead);
  return [...section, "", ...section];
}

/** A markdown file inside the given directory whose top heading parents two sibling headings with the same text. */
export function markdownDuplicateSiblingHeadings(
  scenario: SpecTreeLinkScenario,
  directory: string,
): MarkdownSupportingFile {
  return {
    path: posix.join(directory, scenario.citingFileName),
    content: markdownDocument(scenario.citingProse, duplicateSiblingHeadingLines(scenario), 0).content,
  };
}

/** A markdown file inside the given directory that repeats one heading under two distinct parent sections. */
export function markdownRepeatedHeadingUnderDistinctParents(
  scenario: SpecTreeLinkScenario,
  directory: string,
): MarkdownSupportingFile {
  const bodyLines = scenario.sectionHeadings.flatMap((sectionHeading, index) => [
    ...(index === 0 ? [] : [""]),
    ...sectionLines(MARKDOWN_SECTION_PREFIX, sectionHeading, scenario.citingProse.lead),
    "",
    ...sectionLines(MARKDOWN_SUBSECTION_PREFIX, scenario.repeatedHeading, scenario.citingProse.lead),
  ]);
  return {
    path: posix.join(directory, scenario.sourceFileName),
    content: markdownDocument(scenario.citingProse, bodyLines, 0).content,
  };
}

/** A markdown file with duplicate sibling headings that also carries a relative link to a missing file. */
export function markdownDuplicateSiblingHeadingsWithBrokenLink(
  scenario: SpecTreeLinkScenario,
  directory: string,
): MarkdownLinkCase {
  const headingLines = duplicateSiblingHeadingLines(scenario);
  const href = `${CURRENT_DIRECTORY_PREFIX}${scenario.missingFileName}`;
  return {
    citingFile: posix.join(directory, scenario.citingFileName),
    href,
    ...markdownDocument(
      scenario.citingProse,
      [...headingLines, "", `${scenario.linkText} [${scenario.linkText}](${href})`],
      headingLines.length + 1,
    ),
  };
}

/**
 * A node listed in the spec-tree exclude file: its spec-tree-relative entry, broken links in its direct
 * markdown files under both markdown extensions, and a broken link in a markdown file of a child node.
 */
export interface SpecTreeExcludedNodeCase {
  /** Product-relative directory of the excluded node. */
  readonly nodeDirectory: string;
  /** The node's entry in the spec-tree exclude file, relative to the spec-tree root. */
  readonly excludeEntry: string;
  readonly directFiles: readonly MarkdownLinkCase[];
  readonly childNodeFile: MarkdownLinkCase;
}

/** Composes an excluded node from the scenario's citing node and its child node. */
export function specTreeExcludedNodeCase(scenario: SpecTreeLinkScenario): SpecTreeExcludedNodeCase {
  return {
    nodeDirectory: scenario.nodeDirectory,
    excludeEntry: posix.relative(SPEC_TREE_CONFIG.ROOT_DIRECTORY, scenario.nodeDirectory),
    directFiles: [
      markdownBrokenRelativeLink(scenario, scenario.nodeDirectory),
      markdownSecondaryExtensionBrokenLink(scenario, scenario.nodeDirectory),
    ],
    childNodeFile: markdownBrokenRelativeLink(
      scenario,
      posix.join(scenario.nodeDirectory, scenario.childNodeSegment),
    ),
  };
}

/** A product-relative markdown path outside the default directories that names no file. */
export function markdownMissingScopePath(scenario: SpecTreeLinkScenario): string {
  return posix.join(scenario.outsideDirectory, scenario.missingFileName);
}

/** A file outside the default directories whose extension is not markdown. */
export function markdownUnrelatedScopeFile(scenario: SpecTreeLinkScenario): MarkdownSupportingFile {
  return {
    path: posix.join(
      scenario.outsideDirectory,
      `${scenario.citingStem}${FILE_EXTENSION_SEPARATOR}${scenario.unrelatedExtension}`,
    ),
    content: targetContent(scenario),
  };
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
