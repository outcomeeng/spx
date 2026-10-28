/**
 * Cases and spec-stated expectations for the spec-tree link grammar: the kind each link target
 * maps to, the product-relative path each admitted target resolves to, the decision each
 * citation binds, and the evidence links the grammar admits.
 *
 * Every expectation is constructed from the parts that built the target, following the
 * governing spec's statements, so no expectation is read from the grammar's classifier or its
 * path resolver. Node directories and decision files carry the form the 4.0 naming-schema
 * version accepts, because the grammar judges a target by the entry recognition of the
 * selection it receives.
 *
 * @module generators/spec-tree/link-grammar
 */

import {
  KIND_REGISTRY,
  SPEC_TREE_CONFIG,
  SPEC_TREE_EVIDENCE_LINK_TEXTS,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_LINK_KIND,
  SPEC_TREE_LINK_PARENT_SEGMENT,
  SPEC_TREE_LINK_ROOT_ANCHOR,
  SPEC_TREE_METHODOLOGY_LINE,
  type SpecTreeGrammarSelection,
  type SpecTreeLinkKind,
} from "@/lib/spec-tree";
import {
  orderedDirectoryName,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
  specTreeGrammarSelectionForLine,
} from "@testing/generators/spec-tree/spec-tree";

/** The syntax a link target is written in: the URL scheme delimiter, the suffix markers, and the backslash separator. */
const LINK_SYNTAX = {
  SCHEME: "https:",
  AUTHORITY_PREFIX: "//",
  FRAGMENT: "#",
  QUERY: "?",
  BACKSLASH: "\\",
  MARKDOWN_SUFFIX: ".md",
} as const;

/** The grammar selection whose entry recognition the link grammar cases are judged under. */
export const LINK_GRAMMAR_SELECTION: SpecTreeGrammarSelection = specTreeGrammarSelectionForLine(
  SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO,
);

/** One link target, the kind the spec maps it to, and the product-relative path it resolves to, or `null` when it resolves to none. */
export type LinkKindCase = {
  readonly title: string;
  readonly kind: SpecTreeLinkKind;
  readonly citingDocumentPath: string;
  readonly href: string;
  readonly resolvedPath: string | null;
};

/** One link target cited from a document and the decision path it binds, or `null` when it binds none. */
export type DecisionCitationCase = {
  readonly title: string;
  readonly citingDocumentPath: string;
  readonly href: string;
  readonly citedPath: string | null;
};

/** One prose run that writes a decision path as text and the decision path the run writes. */
export type DecisionPathTextCase = {
  readonly title: string;
  readonly text: string;
  readonly writtenPath: string;
};

/** One link text with a target and whether the grammar admits that link. */
export type EvidenceLinkCase = {
  readonly title: string;
  readonly linkText: string;
  readonly href: string;
  readonly admitted: boolean;
};

const PATH_SEPARATOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;

function slugAt(drawIndex: number): string {
  return sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), drawIndex);
}

function nodeDirectoryAt(drawIndex: number): string {
  return orderedDirectoryName(KIND_REGISTRY.capability.suffix, drawIndex);
}

function decisionFileAt(drawIndex: number, suffix: string): string {
  const order = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder(), drawIndex);
  return `${order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slugAt(drawIndex)}${suffix}`;
}

function join(...segments: readonly string[]): string {
  return segments.join(PATH_SEPARATOR);
}

/** The citing node's directory and a spec document inside it, both product-relative. */
function citingNode(drawIndex: number): { readonly directory: string; readonly document: string } {
  const directory = join(SPEC_TREE_CONFIG.ROOT_DIRECTORY, nodeDirectoryAt(drawIndex));
  return { directory, document: join(directory, `${slugAt(drawIndex)}${LINK_SYNTAX.MARKDOWN_SUFFIX}`) };
}

/** One case per link kind, and a second per admitted kind that carries a fragment, in the spec's mapping order. */
export function linkKindCases(): readonly LinkKindCase[] {
  const citing = citingNode(0);
  const file = (drawIndex: number): string => `${slugAt(drawIndex)}${LINK_SYNTAX.MARKDOWN_SUFFIX}`;
  const nodeLocalPath = join(slugAt(1), file(2));
  const treeAbsolutePath = join(SPEC_TREE_CONFIG.ROOT_DIRECTORY, nodeDirectoryAt(3), file(4));
  const withKind = (
    kind: SpecTreeLinkKind,
    title: string,
    href: string,
    resolvedPath: string | null = null,
  ): LinkKindCase => ({ title, kind, citingDocumentPath: citing.document, href, resolvedPath });

  return [
    withKind(
      SPEC_TREE_LINK_KIND.URL,
      "a URL scheme",
      `${LINK_SYNTAX.SCHEME}${LINK_SYNTAX.AUTHORITY_PREFIX}${slugAt(5)}${PATH_SEPARATOR}${file(6)}`,
    ),
    withKind(SPEC_TREE_LINK_KIND.NO_PATH, "a fragment alone", `${LINK_SYNTAX.FRAGMENT}${slugAt(7)}`),
    withKind(SPEC_TREE_LINK_KIND.NO_PATH, "a query alone", `${LINK_SYNTAX.QUERY}${slugAt(8)}`),
    withKind(
      SPEC_TREE_LINK_KIND.ROOT_ANCHORED,
      "a leading slash",
      `${SPEC_TREE_LINK_ROOT_ANCHOR}${join(slugAt(9), file(10))}`,
    ),
    withKind(
      SPEC_TREE_LINK_KIND.PARENT_CLIMB,
      "a parent-directory segment",
      join(SPEC_TREE_LINK_PARENT_SEGMENT, file(11)),
    ),
    withKind(
      SPEC_TREE_LINK_KIND.DESCENDANT_NODE,
      "a first segment naming a node directory",
      join(nodeDirectoryAt(12), file(13)),
    ),
    withKind(
      SPEC_TREE_LINK_KIND.BACKSLASH_SEPARATED,
      "a backslash separator",
      `${slugAt(14)}${LINK_SYNTAX.BACKSLASH}${file(15)}`,
    ),
    withKind(SPEC_TREE_LINK_KIND.TREE_ABSOLUTE, "a path from the spec-tree root", treeAbsolutePath, treeAbsolutePath),
    withKind(
      SPEC_TREE_LINK_KIND.TREE_ABSOLUTE,
      "a path from the spec-tree root with a fragment",
      `${treeAbsolutePath}${LINK_SYNTAX.FRAGMENT}${slugAt(16)}`,
      treeAbsolutePath,
    ),
    withKind(
      SPEC_TREE_LINK_KIND.NODE_LOCAL,
      "any other relative path",
      nodeLocalPath,
      join(citing.directory, nodeLocalPath),
    ),
    withKind(
      SPEC_TREE_LINK_KIND.NODE_LOCAL,
      "any other relative path with a query",
      `${nodeLocalPath}${LINK_SYNTAX.QUERY}${slugAt(17)}`,
      join(citing.directory, nodeLocalPath),
    ),
  ];
}

/**
 * Link targets that name a decision record a selection recognizes, in the shapes a citation
 * binds through and in each shape it does not, beside admitted targets that name no decision.
 */
export function decisionCitationCases(): readonly DecisionCitationCase[] {
  const citing = citingNode(20);
  const adrFile = decisionFileAt(21, KIND_REGISTRY.adr.suffix);
  const pdrFile = decisionFileAt(22, KIND_REGISTRY.pdr.suffix);
  const decisionNode = nodeDirectoryAt(23);
  const treeAbsoluteDecision = join(SPEC_TREE_CONFIG.ROOT_DIRECTORY, decisionNode, adrFile);
  const nodeLocalDecision = join(slugAt(24), pdrFile);
  const specDocument = `${slugAt(25)}${LINK_SYNTAX.MARKDOWN_SUFFIX}`;
  const unbound = (title: string, href: string): DecisionCitationCase => ({
    title,
    citingDocumentPath: citing.document,
    href,
    citedPath: null,
  });

  return [
    {
      title: "a tree-absolute link to a decision record",
      citingDocumentPath: citing.document,
      href: treeAbsoluteDecision,
      citedPath: treeAbsoluteDecision,
    },
    {
      title: "a tree-absolute link to a decision record with a fragment",
      citingDocumentPath: citing.document,
      href: `${treeAbsoluteDecision}${LINK_SYNTAX.FRAGMENT}${slugAt(26)}`,
      citedPath: treeAbsoluteDecision,
    },
    {
      title: "a node-local link to a decision record inside the citing node",
      citingDocumentPath: citing.document,
      href: nodeLocalDecision,
      citedPath: join(citing.directory, nodeLocalDecision),
    },
    unbound(
      "a tree-absolute link to a path that names no decision record",
      join(SPEC_TREE_CONFIG.ROOT_DIRECTORY, decisionNode, specDocument),
    ),
    unbound("a node-local link to a path that names no decision record", join(slugAt(27), specDocument)),
    unbound("a leading-slash link to a decision record", `${SPEC_TREE_LINK_ROOT_ANCHOR}${treeAbsoluteDecision}`),
    unbound("a parent-climb link to a decision record", join(SPEC_TREE_LINK_PARENT_SEGMENT, adrFile)),
    unbound("a link entering a descendant node to a decision record", join(nodeDirectoryAt(28), pdrFile)),
    unbound(
      "a backslash-separated link to a decision record",
      `${slugAt(29)}${LINK_SYNTAX.BACKSLASH}${pdrFile}`,
    ),
    unbound(
      "a URL link to a decision record",
      `${LINK_SYNTAX.SCHEME}${LINK_SYNTAX.AUTHORITY_PREFIX}${treeAbsoluteDecision}`,
    ),
    unbound("a fragment alone", `${LINK_SYNTAX.FRAGMENT}${slugAt(30)}`),
  ];
}

/** Prose runs that write a decision path as text: bare, and inside an inline code span. */
export function decisionPathTextCases(): readonly DecisionPathTextCase[] {
  const writtenPath = join(
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    nodeDirectoryAt(40),
    decisionFileAt(41, KIND_REGISTRY.adr.suffix),
  );
  const sentence = `${slugAt(42)} ${slugAt(43)}`;
  return [
    { title: "a bare decision path", text: `${sentence} ${writtenPath} ${slugAt(44)}`, writtenPath },
    {
      title: "a decision path in an inline code span",
      text: `${sentence} \`${writtenPath}\` ${slugAt(45)}`,
      writtenPath,
    },
  ];
}

/** Every evidence link text with a tree-absolute and a node-local target, and a non-evidence text with a tree-absolute target. */
export function evidenceLinkCases(): readonly EvidenceLinkCase[] {
  const treeAbsolute = join(SPEC_TREE_CONFIG.ROOT_DIRECTORY, nodeDirectoryAt(50), slugAt(51));
  const nodeLocal = join(slugAt(52), slugAt(53));
  return [
    ...SPEC_TREE_EVIDENCE_LINK_TEXTS.flatMap((linkText) => [
      { title: `a ${linkText} link written tree-absolute`, linkText, href: treeAbsolute, admitted: false },
      { title: `a ${linkText} link written node-local`, linkText, href: nodeLocal, admitted: true },
    ]),
    {
      title: "a link whose text is no evidence text, written tree-absolute",
      linkText: slugAt(54),
      href: treeAbsolute,
      admitted: true,
    },
  ];
}
