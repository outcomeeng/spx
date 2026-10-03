import * as fc from "fast-check";
import { posix } from "node:path";

import {
  DECISION_SUFFIXES,
  NODE_SUFFIXES,
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_LINK_PARENT_SEGMENT,
  SPEC_TREE_LINK_ROOT_ANCHOR,
} from "@/lib/spec-tree";
import {
  MARKDOWN_DEFAULT_DIRECTORY_NAMES,
  MARKDOWN_FILE_EXTENSIONS,
  MARKDOWN_PRIMARY_FILE_EXTENSION,
  MARKDOWN_SECONDARY_FILE_EXTENSION,
  MARKDOWN_VALIDATION_TARGET_KIND,
  type MarkdownValidationTarget,
} from "@/validation/steps/markdown";
import { MARKDOWN_LINK_SHAPE_DIAGNOSTICS } from "@/validation/steps/markdown-link-shape-rule";
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
/** Four leading spaces after a blank line open an indented code block. */
const MARKDOWN_INDENTED_CODE_PREFIX = "    ";
const MARKDOWN_HTML_BLOCK_OPEN = "<div>";
const MARKDOWN_HTML_BLOCK_CLOSE = "</div>";
const MARKDOWN_SECTION_PREFIX = "## ";
const MARKDOWN_SUBSECTION_PREFIX = "### ";
/** The character the spec names inside a markdown file path. */
const FILE_NAME_COLON = ":";
const FILE_EXTENSION_SEPARATOR = ".";
const FRAGMENT_SEPARATOR = "#";
/** GitHub heading anchors join the lowercased heading words with hyphens. */
const HEADING_ANCHOR_WORD_SEPARATOR = "-";
const CURRENT_DIRECTORY_SEGMENT = ".";
const CURRENT_DIRECTORY_PREFIX = `${CURRENT_DIRECTORY_SEGMENT}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}`;
const EXTERNAL_URL_SCHEME = "https://";
const EXTERNAL_RESERVED_DOMAIN = ".invalid";
const SENTENCE_END = ".";
const WORD_SEPARATOR = " ";
/**
 * The link texts that mark an assertion evidence link, as the markdown-validation spec enumerates them; any
 * other link text marks a link that is not assertion evidence.
 */
const SPEC_TREE_EVIDENCE_LINK_TEXTS = ["test", "eval", "probe"] as const;

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
  /**
   * Product-relative paths the repository tracks once the case is written; absent when the product root is
   * no git repository.
   */
  readonly trackedPaths?: readonly string[];
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
        || MARKDOWN_FILE_EXTENSIONS.has(`${FILE_EXTENSION_SEPARATOR}${name}`)
        || (SPEC_TREE_EVIDENCE_LINK_TEXTS as readonly string[]).includes(name)
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

function markdownLinkingTo(
  scenario: SpecTreeLinkScenario,
  citingFile: string,
  href: string,
  text: string = scenario.linkText,
): MarkdownLinkCase {
  return {
    citingFile,
    href,
    ...markdownDocument(scenario.citingProse, [`${scenario.linkText} [${text}](${href})`], 0),
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

/** Percent-encodes every character of a path segment, as a link target may spell it. */
function percentEncodedSegment(segment: string): string {
  return [...segment].map((character) => `%${(character.codePointAt(0) ?? 0).toString(16).toUpperCase()}`).join("");
}

/**
 * The backslash, which the URL parser that resolves a file link reads as a path
 * separator. markdown-it delivers a backslash written in a link destination to
 * a rule percent-encoded, so its encoded spelling is the href a rule receives
 * for either spelling.
 */
const URL_BACKSLASH_SEPARATOR = "\\";

/** A rejected-shape link together with the diagnostic its shape reports. */
export interface MarkdownRejectedShapeCase extends MarkdownLinkShapeCase {
  readonly diagnostic: (typeof MARKDOWN_LINK_SHAPE_DIAGNOSTICS)[keyof typeof MARKDOWN_LINK_SHAPE_DIAGNOSTICS];
}

/** Joins path segments with the percent-encoded backslash separator. */
function encodedBackslashJoin(...segments: readonly string[]): string {
  return segments.join(percentEncodedSegment(URL_BACKSLASH_SEPARATOR));
}

/**
 * The link shapes the spec rejects inside `spx/` — a `../` climb, written
 * plainly, percent-encoded, and with backslash separators, a leading-slash
 * anchor, and a relative path into a descendant node's directory, written
 * plainly and with backslash separators — each naming a file that exists, with
 * the diagnostic its shape reports.
 */
export function specTreeRejectedShapeLinks(scenario: SpecTreeLinkScenario): readonly MarkdownRejectedShapeCase[] {
  const citingFile = specTreeCitingFile(scenario);
  const descendantTarget = posix.join(scenario.childNodeSegment, scenario.targetFileName);
  const supportingFiles = [
    { path: linkedFile(scenario), content: targetContent(scenario) },
    { path: posix.join(scenario.nodeDirectory, descendantTarget), content: targetContent(scenario) },
  ];
  const { DESCENDANT_NODE, LEADING_SLASH, PARENT_CLIMB } = MARKDOWN_LINK_SHAPE_DIAGNOSTICS;
  return [
    {
      href: posix.join(SPEC_TREE_LINK_PARENT_SEGMENT, scenario.nodeSegment, scenario.targetFileName),
      diagnostic: PARENT_CLIMB,
    },
    {
      href: posix.join(
        percentEncodedSegment(SPEC_TREE_LINK_PARENT_SEGMENT),
        scenario.nodeSegment,
        scenario.targetFileName,
      ),
      diagnostic: PARENT_CLIMB,
    },
    {
      href: encodedBackslashJoin(SPEC_TREE_LINK_PARENT_SEGMENT, scenario.nodeSegment, scenario.targetFileName),
      diagnostic: PARENT_CLIMB,
    },
    { href: `${SPEC_TREE_LINK_ROOT_ANCHOR}${linkedFile(scenario)}`, diagnostic: LEADING_SLASH },
    { href: descendantTarget, diagnostic: DESCENDANT_NODE },
    {
      href: encodedBackslashJoin(CURRENT_DIRECTORY_SEGMENT, scenario.childNodeSegment, scenario.targetFileName),
      diagnostic: DESCENDANT_NODE,
    },
  ].map(({ href, diagnostic }) => ({
    link: markdownLinkingTo(scenario, citingFile, href),
    supportingFiles,
    diagnostic,
  }));
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

/** Whether the repository tracks the file an evidence-link case's link names. */
export const EVIDENCE_LINK_TARGET_TRACKING = {
  /** The citing file and the linked file are tracked. */
  TRACKED: "tracked",
  /** The citing file alone is tracked, so the linked file exists on disk but not in the tracked set. */
  UNTRACKED: "untracked",
} as const;

export type EvidenceLinkTargetTracking =
  (typeof EVIDENCE_LINK_TARGET_TRACKING)[keyof typeof EVIDENCE_LINK_TARGET_TRACKING];

/** A link inside `spx/` whose text and target tracking an evidence-link case varies. */
export interface MarkdownEvidenceLinkCase extends MarkdownLinkShapeCase {
  readonly text: string;
  readonly targetTracking: EvidenceLinkTargetTracking;
  readonly trackedPaths: readonly string[];
}

function evidenceLinkCase(
  scenario: SpecTreeLinkScenario,
  href: string,
  text: string,
  targetTracking: EvidenceLinkTargetTracking,
): MarkdownEvidenceLinkCase {
  const link = markdownLinkingTo(scenario, specTreeCitingFile(scenario), href, text);
  return {
    link,
    text,
    targetTracking,
    supportingFiles: [{ path: linkedFile(scenario), content: targetContent(scenario) }],
    trackedPaths: targetTracking === EVIDENCE_LINK_TARGET_TRACKING.TRACKED
      ? [link.citingFile, linkedFile(scenario)]
      : [link.citingFile],
  };
}

/**
 * Assertion evidence links whose href is tree-absolute: each evidence link text, linking to an existing file
 * in the citing node that the repository tracks and that it does not track.
 */
export function specTreeTreeAbsoluteEvidenceLinks(scenario: SpecTreeLinkScenario): readonly MarkdownEvidenceLinkCase[] {
  return SPEC_TREE_EVIDENCE_LINK_TEXTS.flatMap((text) =>
    Object.values(EVIDENCE_LINK_TARGET_TRACKING).map((targetTracking) =>
      evidenceLinkCase(scenario, linkedFile(scenario), text, targetTracking)
    )
  );
}

/**
 * Links to a tracked file in the citing node that the evidence-link shape rule admits: a tree-absolute link
 * whose text is not an evidence link text, and each evidence link text with a node-local href.
 */
export function specTreeAdmittedEvidenceShapeLinks(
  scenario: SpecTreeLinkScenario,
): readonly MarkdownEvidenceLinkCase[] {
  const { TRACKED } = EVIDENCE_LINK_TARGET_TRACKING;
  return [
    evidenceLinkCase(scenario, linkedFile(scenario), scenario.linkText, TRACKED),
    ...SPEC_TREE_EVIDENCE_LINK_TEXTS.map((text) => evidenceLinkCase(scenario, scenario.targetFileName, text, TRACKED)),
  ];
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

/** Which kind of path an explicit operand below an excluded directory names. */
export const EXPLICIT_MARKDOWN_OPERAND_KIND = {
  DIRECTORY: "directory",
  FILE: "file",
} as const;

export type ExplicitMarkdownOperandKind =
  (typeof EXPLICIT_MARKDOWN_OPERAND_KIND)[keyof typeof EXPLICIT_MARKDOWN_OPERAND_KIND];

/** An explicit operand inside a directory the markdown path filters exclude, and the broken link it reaches. */
export interface ExplicitMarkdownOperandCase {
  /** Product-relative directory the markdown path filters exclude. */
  readonly excludedDirectory: string;
  /** The explicit operand: a directory below the excluded directory, or a markdown file inside it. */
  readonly operand: string;
  /** The markdown file the operand reaches, carrying a relative link to a missing file. */
  readonly brokenLink: MarkdownLinkCase;
}

/**
 * Composes an explicit operand below the scenario's citing node, which the case excludes: a non-node directory
 * inside the node holding the broken-link file, or the broken-link file directly inside the node.
 */
export function explicitMarkdownOperandCase(
  scenario: SpecTreeLinkScenario,
  kind: ExplicitMarkdownOperandKind,
): ExplicitMarkdownOperandCase {
  const excludedDirectory = scenario.nodeDirectory;
  if (kind === EXPLICIT_MARKDOWN_OPERAND_KIND.DIRECTORY) {
    const operand = posix.join(excludedDirectory, scenario.localDirectory);
    return { excludedDirectory, operand, brokenLink: markdownBrokenRelativeLink(scenario, operand) };
  }
  const brokenLink = markdownBrokenRelativeLink(scenario, excludedDirectory);
  return { excludedDirectory, operand: brokenLink.citingFile, brokenLink };
}

/** A markdown file inside the given directory carrying only the scenario's citing prose, so it has no problem. */
export function markdownProblemFreeFile(scenario: SpecTreeLinkScenario, directory: string): MarkdownSupportingFile {
  return {
    path: posix.join(directory, scenario.sourceFileName),
    content: markdownDocument(scenario.citingProse, [scenario.citingProse.lead], 0).content,
  };
}

/**
 * Two spec-tree directories a markdown include filter names, a problem-free file in the first, and a broken-link
 * file in the second. An explicit operand naming the first directory validates only the problem-free file.
 */
export interface ExplicitMarkdownIncludeCase {
  readonly operandDirectory: string;
  readonly otherIncludedDirectory: string;
  readonly problemFreeFile: MarkdownSupportingFile;
  readonly brokenLink: MarkdownLinkCase;
}

/** Composes the include case from the scenario's citing node and a non-node directory beside it. */
export function explicitMarkdownIncludeCase(scenario: SpecTreeLinkScenario): ExplicitMarkdownIncludeCase {
  const operandDirectory = scenario.nodeDirectory;
  const otherIncludedDirectory = posix.join(posix.dirname(scenario.nodeDirectory), scenario.localDirectory);
  return {
    operandDirectory,
    otherIncludedDirectory,
    problemFreeFile: markdownProblemFreeFile(scenario, operandDirectory),
    brokenLink: markdownBrokenRelativeLink(scenario, otherIncludedDirectory),
  };
}

/**
 * A problem-free file in a product-root directory outside the default markdown directories, and a broken-link
 * file in the docs directory. An explicit operand naming the outside directory validates only the problem-free
 * file.
 */
export interface ExplicitMarkdownOutsideDefaultsCase {
  readonly operandDirectory: string;
  readonly problemFreeFile: MarkdownSupportingFile;
  readonly brokenLink: MarkdownLinkCase;
}

export function explicitMarkdownOutsideDefaultsCase(
  scenario: SpecTreeLinkScenario,
): ExplicitMarkdownOutsideDefaultsCase {
  const [, docsDirectory] = MARKDOWN_DEFAULT_DIRECTORY_NAMES;
  return {
    operandDirectory: scenario.outsideDirectory,
    problemFreeFile: markdownProblemFreeFile(scenario, scenario.outsideDirectory),
    brokenLink: markdownBrokenRelativeLink(scenario, docsDirectory),
  };
}

/** The product root spelled as a relative operand: the scenario's outside directory followed by a parent climb. */
export function markdownProductRootOperand(scenario: SpecTreeLinkScenario): string {
  return posix.join(scenario.outsideDirectory, SPEC_TREE_LINK_PARENT_SEGMENT);
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
      markdownLinkingTo(scenario, docsCitingFile(scenario), `${SPEC_TREE_LINK_ROOT_ANCHOR}${linkedFile(scenario)}`),
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

/** Which of a decision-path case's files the repository tracks. */
const DECISION_CASE_TRACKING = {
  /** The citing file and the decision. */
  ALL: "all",
  /** The citing file alone, so the decision exists on disk but not in the tracked set. */
  CITING_ONLY: "citing-only",
  /** Nothing: the product root is no git repository. */
  NONE: "none",
} as const;

type DecisionCaseTracking = (typeof DECISION_CASE_TRACKING)[keyof typeof DECISION_CASE_TRACKING];

function decisionPathCase(
  scenario: SpecTreeLinkScenario,
  link: MarkdownLinkCase,
  tracking: DecisionCaseTracking = DECISION_CASE_TRACKING.ALL,
): MarkdownLinkShapeCase {
  const trackedPaths = {
    [DECISION_CASE_TRACKING.ALL]: [link.citingFile, decisionPath(scenario)],
    [DECISION_CASE_TRACKING.CITING_ONLY]: [link.citingFile],
    [DECISION_CASE_TRACKING.NONE]: undefined,
  }[tracking];
  return {
    link,
    supportingFiles: [{ path: decisionPath(scenario), content: targetContent(scenario) }],
    ...(trackedPaths === undefined ? {} : { trackedPaths }),
  };
}

function textMentioning(scenario: SpecTreeLinkScenario, written: string, path: string): MarkdownLinkCase {
  return {
    citingFile: specTreeCitingFile(scenario),
    href: path,
    ...markdownDocument(scenario.citingProse, [`${scenario.citingProse.lead} ${written}${SENTENCE_END}`], 0),
  };
}

function blockMentioning(
  scenario: SpecTreeLinkScenario,
  bodyLines: readonly string[],
  markedOffset: number,
): MarkdownLinkCase {
  return {
    citingFile: specTreeCitingFile(scenario),
    href: decisionPath(scenario),
    ...markdownDocument(scenario.citingProse, bodyLines, markedOffset),
  };
}

/**
 * A tracked decision's path written as text outside a link and outside a fenced code block: bare, inside an
 * inline code span, inside an indented code block, and inside an HTML block.
 */
export function specTreeDecisionPathTextCases(scenario: SpecTreeLinkScenario): readonly MarkdownLinkShapeCase[] {
  const path = decisionPath(scenario);
  const inlineCases = [path, `\`${path}\``].map((written) => textMentioning(scenario, written, path));
  const blockCases = [
    blockMentioning(scenario, [`${MARKDOWN_INDENTED_CODE_PREFIX}${path}`], 0),
    blockMentioning(
      scenario,
      [MARKDOWN_HTML_BLOCK_OPEN, `${scenario.citingProse.lead} ${path}${SENTENCE_END}`, MARKDOWN_HTML_BLOCK_CLOSE],
      1,
    ),
  ];
  return [...inlineCases, ...blockCases].map((link) => decisionPathCase(scenario, link));
}

/**
 * Decision-shaped text that names no tracked decision: a decision filename without the spec-tree prefix, an
 * `spx/` path whose decision exists on disk but is absent from the tracked set, and an `spx/` path when the
 * product root is no git repository, so no tracked set exists.
 */
export function specTreeDecisionPathUntrackedTextCases(
  scenario: SpecTreeLinkScenario,
): readonly MarkdownLinkShapeCase[] {
  const path = decisionPath(scenario);
  return [
    decisionPathCase(scenario, textMentioning(scenario, scenario.decisionFile, scenario.decisionFile)),
    decisionPathCase(scenario, textMentioning(scenario, path, path), DECISION_CASE_TRACKING.CITING_ONLY),
    decisionPathCase(scenario, textMentioning(scenario, path, path), DECISION_CASE_TRACKING.NONE),
  ];
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
