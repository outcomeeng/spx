/**
 * Spec-tree link grammar.
 *
 * Inside the spec tree a link target takes one of two admitted shapes:
 * tree-absolute, written literally from the spec-tree root, or node-local, a
 * relative path from the citing document's directory. A target that anchors at
 * a leading slash or climbs with a parent-directory segment is rejected; a
 * target that carries a URL scheme or names no path — a fragment or query
 * alone — is outside the grammar. Every consumer that classifies or resolves a
 * spec-tree link reads this one declaration.
 *
 * @module lib/spec-tree-link-grammar
 */

import { posix } from "node:path";

import { SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";

/** The prefix every tree-absolute link target and every product-relative spec-tree path starts with. */
export const SPEC_TREE_ROOT_PREFIX = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}`;

/** The leading character that anchors a link target at the product root, which the grammar rejects. */
export const SPEC_TREE_LINK_ROOT_ANCHOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;

/** The path segment that climbs to a parent directory, which the grammar rejects. */
export const SPEC_TREE_LINK_PARENT_SEGMENT = "..";

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
  /** A path written from the spec-tree root; admitted. */
  TREE_ABSOLUTE: "tree-absolute",
  /** A path relative to the citing document's directory; admitted. */
  NODE_LOCAL: "node-local",
} as const;

export type SpecTreeLinkKind = (typeof SPEC_TREE_LINK_KIND)[keyof typeof SPEC_TREE_LINK_KIND];

/** A link target classified against the spec-tree link grammar. */
export interface SpecTreeLink {
  readonly kind: SpecTreeLinkKind;
  /** The target's path as written, without its query or fragment suffix. */
  readonly path: string;
}

/** The link target's path as written, without its query or fragment suffix. */
export function specTreeLinkPath(href: string): string {
  const [path = ""] = href.split(LINK_TARGET_SUFFIX_PATTERN);
  return path;
}

/** Classifies a link target against the spec-tree link grammar. */
export function parseSpecTreeLink(href: string): SpecTreeLink {
  const path = specTreeLinkPath(href);
  return { kind: specTreeLinkKind(href, path), path };
}

function specTreeLinkKind(href: string, path: string): SpecTreeLinkKind {
  if (URL_SCHEME_PATTERN.test(href)) return SPEC_TREE_LINK_KIND.URL;
  if (path.length === 0) return SPEC_TREE_LINK_KIND.NO_PATH;
  if (path.startsWith(SPEC_TREE_LINK_ROOT_ANCHOR)) return SPEC_TREE_LINK_KIND.ROOT_ANCHORED;
  if (path.split(SPEC_TREE_GRAMMAR.PATH_SEPARATOR).includes(SPEC_TREE_LINK_PARENT_SEGMENT)) {
    return SPEC_TREE_LINK_KIND.PARENT_CLIMB;
  }
  if (path.startsWith(SPEC_TREE_ROOT_PREFIX)) return SPEC_TREE_LINK_KIND.TREE_ABSOLUTE;
  return SPEC_TREE_LINK_KIND.NODE_LOCAL;
}

/**
 * The product-relative path an admitted link names, resolved from the product
 * root for a tree-absolute link and from the citing document's directory for a
 * node-local link, or `null` for a link the grammar does not admit.
 *
 * @param citingDocumentPath - Product-relative path of the citing document, with `/` separators
 */
export function resolveSpecTreeLink(citingDocumentPath: string, link: SpecTreeLink): string | null {
  if (link.kind === SPEC_TREE_LINK_KIND.TREE_ABSOLUTE) return posix.normalize(link.path);
  if (link.kind === SPEC_TREE_LINK_KIND.NODE_LOCAL) return posix.join(posix.dirname(citingDocumentPath), link.path);
  return null;
}
