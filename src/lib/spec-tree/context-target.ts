import { posix } from "node:path";

import { SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "./config";
import { compareSpecContextOrdinal } from "./context-manifest";
import type { SpecTreeNode, SpecTreeSnapshot } from "./index";

/** The canonical identity of the product-root target: the tree root directory with its trailing separator. */
export const SPEC_CONTEXT_PRODUCT_ROOT_TARGET = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}`;

export const SPEC_CONTEXT_TARGET_FAILURE_KIND = {
  AMBIGUOUS: "ambiguous",
  OUTSIDE_PRODUCT: "outside-product",
  UNRESOLVED: "unresolved",
} as const;

export type SpecContextTargetFailureKind =
  (typeof SPEC_CONTEXT_TARGET_FAILURE_KIND)[keyof typeof SPEC_CONTEXT_TARGET_FAILURE_KIND];

export interface SpecContextTargetFailure {
  readonly kind: SpecContextTargetFailureKind;
  readonly input: string;
  readonly candidates: readonly string[];
}

export interface SpecContextTarget {
  readonly path: string;
  readonly node?: SpecTreeNode;
}

export interface SpecContextAcceptedPath {
  readonly path: string;
  readonly target: SpecContextTarget;
}

export interface SpecContextTargetPathFacts {
  readonly accepted: readonly (SpecContextAcceptedPath & { readonly realPath: string })[];
  readonly candidates: readonly string[];
  /** True exactly when the operand yielded candidates and every one escaped the resolved product root. */
  readonly outsideProduct: boolean;
}

export type SpecContextTargetResolution =
  | { readonly ok: true; readonly target: SpecContextTarget }
  | { readonly ok: false; readonly failure: SpecContextTargetFailure };

export function specContextAcceptedPaths(snapshot: SpecTreeSnapshot): readonly SpecContextAcceptedPath[] {
  const root: SpecContextTarget = { path: SPEC_CONTEXT_PRODUCT_ROOT_TARGET };
  const accepted: SpecContextAcceptedPath[] = [];
  const targets = new Map(snapshot.allNodes.map((node) => [node.id, {
    node,
    path: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${node.id}`,
  }]));
  if (snapshot.product !== null) {
    accepted.push({ path: ".", target: root }, { path: SPEC_TREE_CONFIG.ROOT_DIRECTORY, target: root });
    if (snapshot.product.ref?.path !== undefined) accepted.push({ path: snapshot.product.ref.path, target: root });
  }
  for (const target of targets.values()) {
    accepted.push({ path: target.path, target });
    if (target.node.ref?.path !== undefined) accepted.push({ path: target.node.ref.path, target });
  }
  for (const decision of snapshot.decisions) {
    const target = decision.parentId === undefined ? root : targets.get(decision.parentId);
    if (target !== undefined && decision.ref?.path !== undefined) {
      accepted.push({ path: decision.ref.path, target });
    }
  }
  return accepted;
}

export function specContextSuffixCandidates(
  accepted: readonly SpecContextAcceptedPath[],
  input: string,
): readonly string[] {
  if (posix.isAbsolute(input) || input.length === 0) return [];
  const normalized = posix.normalize(input).replace(/\/$/, "");
  return accepted.filter(({ path }) => path === normalized || path.endsWith(`/${normalized}`))
    .map(({ path }) => path);
}

/** Select identities only after the caller has supplied contained, canonical filesystem facts. */
export function resolveSpecContextTarget(
  input: string,
  facts: SpecContextTargetPathFacts,
): SpecContextTargetResolution {
  if (facts.outsideProduct) {
    return { ok: false, failure: { kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.OUTSIDE_PRODUCT, input, candidates: [] } };
  }
  const candidates = new Set(facts.candidates);
  const matches = new Map<string, SpecContextTarget>();
  for (const entry of facts.accepted) {
    if (candidates.has(entry.realPath)) matches.set(entry.target.path, entry.target);
  }
  const targets = [...matches.values()].sort((left, right) => compareSpecContextOrdinal(left.path, right.path));
  if (targets.length === 1) return { ok: true, target: targets[0] };
  const kind = targets.length > 1
    ? SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS
    : SPEC_CONTEXT_TARGET_FAILURE_KIND.UNRESOLVED;
  return { ok: false, failure: { kind, input, candidates: targets.map(({ path }) => path) } };
}
