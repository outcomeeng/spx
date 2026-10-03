/**
 * Spec-tree link grammar.
 *
 * Inside the spec tree a link target takes one of two admitted shapes:
 * tree-absolute, written literally from the spec-tree root, or node-local, a
 * relative path from the citing document's directory to a target inside the
 * citing node. A target that anchors at a leading slash, climbs with a
 * parent-directory segment, or enters a descendant node's directory is
 * rejected; a target that carries a URL scheme or names no path — a fragment or
 * query alone — is outside the grammar. A target's path is classified and
 * resolved percent-decoded, as every resolver of the link reads it, so an
 * encoded segment cannot pass as a different shape. Its shape is classified
 * with a backslash separating segments as a slash does, because the URL parser
 * that resolves a file link reads a backslash as a path separator, so a climb,
 * an anchor, or a descendant entry spelled with backslashes — written or
 * percent-encoded — is the same rejected shape. Every consumer that classifies
 * or resolves a spec-tree link reads this one declaration.
 *
 * A decision path is a product-relative path under the spec-tree root that
 * names a decision record. A document cites a decision through an admitted
 * link that resolves to a decision path; prose can also write a decision path
 * as text, which cites nothing.
 *
 * Which directory names a node and which file names a decision is the
 * library's entry recognition; the grammar receives it through
 * {@link SpecTreeLinkRecognition} so that recognition keeps one source.
 *
 * @module lib/spec-tree/link-grammar
 */

import { posix } from "node:path";

import { DECISION_SUFFIXES, SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "./config";

/** The prefix every tree-absolute link target and every product-relative spec-tree path starts with. */
export const SPEC_TREE_ROOT_PREFIX = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}`;

/** The leading character that anchors a link target at the product root, which the grammar rejects. */
export const SPEC_TREE_LINK_ROOT_ANCHOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;

/** The path segment that climbs to a parent directory, which the grammar rejects. */
export const SPEC_TREE_LINK_PARENT_SEGMENT = "..";

/** The path segment that names the citing document's own directory. */
const CURRENT_DIRECTORY_SEGMENT = ".";

/**
 * Separates a link path's segments for shape classification: the path
 * separator, and the backslash the URL parser resolving a file link reads as
 * one.
 */
const LINK_PATH_SEGMENT_SEPARATOR_PATTERN = /[/\\]/u;

/** Marks the start of a link target's query or fragment suffix. */
const LINK_TARGET_SUFFIX_PATTERN = /[?#]/u;

/** A link target that starts with a URL scheme (`https:`, `mailto:`, …). */
const URL_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/u;

/** The shapes a link target takes against the spec-tree link grammar. */
export const SPEC_TREE_LINK_KIND = {
  /** A fragment or query alone, naming no path. */
  NO_PATH: "no-path",
  /** A target carrying a URL scheme. */
  URL: "url",
  /** A path anchored at a leading slash; rejected. */
  ROOT_ANCHORED: "root-anchored",
  /** A path that climbs with a parent-directory segment; rejected. */
  PARENT_CLIMB: "parent-climb",
  /** A relative path whose first segment enters a descendant node's directory; rejected. */
  DESCENDANT_NODE: "descendant-node",
  /** A path written from the spec-tree root; admitted. */
  TREE_ABSOLUTE: "tree-absolute",
  /** A relative path to a target inside the citing node; admitted. */
  NODE_LOCAL: "node-local",
} as const;

export type SpecTreeLinkKind = (typeof SPEC_TREE_LINK_KIND)[keyof typeof SPEC_TREE_LINK_KIND];

/** A link target classified against the spec-tree link grammar. */
export interface SpecTreeLink {
  readonly kind: SpecTreeLinkKind;
  /** The target's percent-decoded path, without its query or fragment suffix. */
  readonly path: string;
}

/** The entry recognition the grammar classifies paths with. */
export interface SpecTreeLinkRecognition {
  /** Whether a single directory name names a spec-tree node. */
  readonly isNodeDirectoryName: (directoryName: string) => boolean;
  /** Whether a path relative to the spec-tree root names a decision record. */
  readonly isDecisionFile: (specTreeRelativePath: string) => boolean;
}

/** The spec-tree link grammar's operations, bound to the library's entry recognition. */
export interface SpecTreeLinkGrammar {
  /** Classifies a link target against the spec-tree link grammar. */
  readonly parseSpecTreeLink: (href: string) => SpecTreeLink;
  /**
   * The product-relative path an admitted link names, resolved from the product
   * root for a tree-absolute link and from the citing document's directory for a
   * node-local link, or `null` for a link the grammar does not admit.
   *
   * The citing document path is product-relative, with `/` separators.
   */
  readonly resolveSpecTreeLink: (citingDocumentPath: string, link: SpecTreeLink) => string | null;
  /** The decision paths a run of prose writes as text, in order of appearance. */
  readonly decisionPathsWrittenAsText: (text: string) => readonly string[];
  /**
   * The decision path a link target cites from the citing document: the
   * product-relative path an admitted link resolves to when that path names a
   * decision record, or `null` for any other target.
   *
   * The citing document path is product-relative, with `/` separators.
   */
  readonly resolveSpecTreeDecisionCitation: (citingDocumentPath: string, href: string) => string | null;
}

/**
 * The link target's percent-decoded path, without its query or fragment
 * suffix; a path whose percent escapes do not decode stays as written.
 */
function specTreeLinkPath(href: string): string {
  const [path = ""] = href.split(LINK_TARGET_SUFFIX_PATTERN);
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * A decision-path candidate inside prose: it starts at the spec-tree root, ends
 * in a decision suffix, and may be followed by sentence punctuation, but not by
 * further path characters (`….adr.mdx`, `….adr.md.bak`).
 */
const DECISION_PATH_TEXT_PATTERN = new RegExp(
  String.raw`(?<![A-Za-z0-9._/-])${escapeRegExp(SPEC_TREE_ROOT_PREFIX)}[A-Za-z0-9._/-]*?(?:${
    DECISION_SUFFIXES.map(escapeRegExp).join("|")
  })(?![A-Za-z0-9_/-]|\.[A-Za-z0-9])`,
  "g",
);

/** Binds the spec-tree link grammar to the library's entry recognition. */
export function createSpecTreeLinkGrammar(recognition: SpecTreeLinkRecognition): SpecTreeLinkGrammar {
  function entersDescendantNode(segments: readonly string[]): boolean {
    const firstSegment = segments.find((segment) => segment.length > 0 && segment !== CURRENT_DIRECTORY_SEGMENT);
    return firstSegment !== undefined && recognition.isNodeDirectoryName(firstSegment);
  }

  function specTreeLinkKind(href: string, path: string): SpecTreeLinkKind {
    if (URL_SCHEME_PATTERN.test(href)) return SPEC_TREE_LINK_KIND.URL;
    if (path.length === 0) return SPEC_TREE_LINK_KIND.NO_PATH;
    const segments = path.split(LINK_PATH_SEGMENT_SEPARATOR_PATTERN);
    if (segments[0] === "") return SPEC_TREE_LINK_KIND.ROOT_ANCHORED;
    if (segments.includes(SPEC_TREE_LINK_PARENT_SEGMENT)) return SPEC_TREE_LINK_KIND.PARENT_CLIMB;
    if (path.startsWith(SPEC_TREE_ROOT_PREFIX)) return SPEC_TREE_LINK_KIND.TREE_ABSOLUTE;
    if (entersDescendantNode(segments)) return SPEC_TREE_LINK_KIND.DESCENDANT_NODE;
    return SPEC_TREE_LINK_KIND.NODE_LOCAL;
  }

  function parseSpecTreeLink(href: string): SpecTreeLink {
    const path = specTreeLinkPath(href);
    return { kind: specTreeLinkKind(href, path), path };
  }

  function resolveSpecTreeLink(citingDocumentPath: string, link: SpecTreeLink): string | null {
    if (link.kind === SPEC_TREE_LINK_KIND.TREE_ABSOLUTE) return posix.normalize(link.path);
    if (link.kind === SPEC_TREE_LINK_KIND.NODE_LOCAL) {
      return posix.join(posix.dirname(citingDocumentPath), link.path);
    }
    return null;
  }

  function isSpecTreeDecisionPath(productRelativePath: string): boolean {
    return productRelativePath.startsWith(SPEC_TREE_ROOT_PREFIX)
      && recognition.isDecisionFile(productRelativePath.slice(SPEC_TREE_ROOT_PREFIX.length));
  }

  function decisionPathsWrittenAsText(text: string): readonly string[] {
    return [...text.matchAll(DECISION_PATH_TEXT_PATTERN)]
      .map(([candidate]) => candidate)
      .filter(isSpecTreeDecisionPath);
  }

  function resolveSpecTreeDecisionCitation(citingDocumentPath: string, href: string): string | null {
    const citedPath = resolveSpecTreeLink(citingDocumentPath, parseSpecTreeLink(href));
    return citedPath !== null && isSpecTreeDecisionPath(citedPath) ? citedPath : null;
  }

  return { parseSpecTreeLink, resolveSpecTreeLink, decisionPathsWrittenAsText, resolveSpecTreeDecisionCitation };
}
