import * as fc from "fast-check";

import { KIND_REGISTRY, SPEC_CONTEXT_OPTIONAL_ARTIFACT, SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import {
  inlineCitation,
  markdownFixtureBody,
  openingParagraph,
  rootedSpecPath,
} from "@testing/generators/spec-tree/rich-context";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";

/** The three declarations a context-walk fixture product carries. */
export const CONTEXT_WALK_DECLARATION = {
  THREE_TWO: "3.2",
  FOUR_ZERO: "4.0",
  FOUR_ZERO_MIGRATING: "4.0-migrating-from-3.2",
} as const;

export type ContextWalkDeclaration = (typeof CONTEXT_WALK_DECLARATION)[keyof typeof CONTEXT_WALK_DECLARATION];

/** The walk a declaration selects: the 3.2 walk loads whole directories, the 4.0 walk projects a read set. */
export const CONTEXT_WALK = { THREE_TWO: "three-two", FOUR_ZERO: "four-zero" } as const;

export type ContextWalk = (typeof CONTEXT_WALK)[keyof typeof CONTEXT_WALK];

/** The roles a fixture path plays in the probed walks. */
export const CONTEXT_WALK_ROLE = {
  PRODUCT: "product",
  ROOT_DECISION_BELOW: "root-decision-below",
  ROOT_DECISION_ABOVE: "root-decision-above",
  PATH_NODE: "path-node",
  PATH_NODE_ISSUES: "path-node-issues",
  PATH_DECISION_BELOW: "path-decision-below",
  PATH_DECISION_ABOVE: "path-decision-above",
  TARGET: "target",
  TARGET_DECISION: "target-decision",
  TARGET_CHILD: "target-child",
  TARGET_KNOWLEDGE_INDEX: "target-knowledge-index",
  TARGET_KNOWLEDGE_BODY: "target-knowledge-body",
  LOWER_SIBLING: "lower-sibling",
  SAME_INDEX_SIBLING: "same-index-sibling",
  HIGHER_INDEX_SIBLING: "higher-index-sibling",
  OUTCOME_SIBLING_RECORD: "outcome-sibling-record",
  ROOT_SIBLING: "root-sibling",
  CITED_DECISION: "cited-decision",
  UNRESOLVED_CITATION: "unresolved-citation",
} as const;

export type ContextWalkRole = (typeof CONTEXT_WALK_ROLE)[keyof typeof CONTEXT_WALK_ROLE];

/** The numeric indices the fixture assigns, each placing a record relative to the child a probed path continues through. */
export const CONTEXT_WALK_ORDER = {
  LOWER: 10,
  BELOW_PATH_CHILD: 20,
  PATH_CHILD: 30,
  TARGET_DECISION: 40,
  ABOVE_PATH_CHILD: 50,
  ROOT_SIBLING: 70,
} as const;

/** One probed target and the read set the declared walk computes for it, as paths in walk order. */
export interface ContextWalkProbe {
  readonly target: string;
  readonly readSet: readonly string[];
  /** The citations the walk finds and cannot resolve; no read set holds one. */
  readonly unresolved: readonly string[];
}

export interface ContextWalkFixture {
  readonly declaration: ContextWalkDeclaration;
  readonly walk: ContextWalk;
  readonly methodology: { readonly version: string; readonly migratingFrom?: string };
  /** Every file of the product, keyed by its path from the product directory. */
  readonly files: Readonly<Record<string, string>>;
  readonly roles: Readonly<Record<ContextWalkRole, string>>;
  readonly probes: readonly ContextWalkProbe[];
}

const SLUG_COUNT = 9;

export function arbitraryContextWalkSlugs(): fc.Arbitrary<readonly string[]> {
  return fc.uniqueArray(SPEC_TREE_TEST_GENERATOR.sourceSlug(), { minLength: SLUG_COUNT, maxLength: SLUG_COUNT });
}

type Grammar = {
  readonly nodeSuffix: string;
  readonly specSuffix: string;
  readonly productSuffix: string;
  readonly productDeclaresKind: boolean;
};

const PRIOR_GRAMMAR: Grammar = {
  nodeSuffix: KIND_REGISTRY.enabler.suffix,
  specSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX,
  productSuffix: SPEC_TREE_CONFIG.PRODUCT.SUFFIX,
  productDeclaresKind: false,
};

const OUTPUT_GRAMMAR: Grammar = {
  nodeSuffix: KIND_REGISTRY.capability.suffix,
  specSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX,
  productSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX,
  productDeclaresKind: true,
};

const SEPARATOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;
const ORDER_SEPARATOR = SPEC_TREE_GRAMMAR.ORDER.SEPARATOR;
const DECISION_SUFFIX = KIND_REGISTRY.adr.suffix;
const KNOWLEDGE_DIRECTORY = SPEC_TREE_GRAMMAR.KNOWLEDGE.DIRECTORY_NAME;
const KNOWLEDGE_INDEX = SPEC_CONTEXT_OPTIONAL_ARTIFACT.KNOWLEDGE_INDEX;
const ISSUES = SPEC_CONTEXT_OPTIONAL_ARTIFACT.ISSUES;
const SLUG_INDEX = {
  PRODUCT: 0,
  PATH_NODE: 1,
  TARGET: 2,
  CHILD: 3,
  LOWER: 4,
  SAME: 5,
  HIGHER: 6,
  ROOT_SIBLING: 7,
  DECISION: 8,
} as const;
const MISSING_DECISION_ORDER = 99;

function join(...segments: readonly string[]): string {
  return segments.join(SEPARATOR);
}

function ordered(order: number, slug: string, suffix: string): string {
  return `${order}${ORDER_SEPARATOR}${slug}${suffix}`;
}

function declarationWalk(declaration: ContextWalkDeclaration): ContextWalk {
  return declaration === CONTEXT_WALK_DECLARATION.THREE_TWO ? CONTEXT_WALK.THREE_TWO : CONTEXT_WALK.FOUR_ZERO;
}

function declarationMethodology(declaration: ContextWalkDeclaration): ContextWalkFixture["methodology"] {
  switch (declaration) {
    case CONTEXT_WALK_DECLARATION.THREE_TWO:
      return { version: "3.2.0" };
    case CONTEXT_WALK_DECLARATION.FOUR_ZERO:
      return { version: "4.0.0" };
    case CONTEXT_WALK_DECLARATION.FOUR_ZERO_MIGRATING:
      return { version: "4.0.0", migratingFrom: "3.2.0" };
  }
}

/**
 * The fixture product of one declaration, built from `slugs` (pairwise distinct).
 * The 3.2 fixture and the migrating fixture hold the prior on-disk forms; the 4.0
 * fixture holds the output forms. Every role path and the per-target read set are
 * derived from the construction, in the order the declared walk computes them.
 */
export function contextWalkFixture(
  declaration: ContextWalkDeclaration,
  slugs: readonly string[],
): ContextWalkFixture {
  const slug = (index: number): string => slugs[index];
  const walk = declarationWalk(declaration);
  const grammar = declaration === CONTEXT_WALK_DECLARATION.FOUR_ZERO ? OUTPUT_GRAMMAR : PRIOR_GRAMMAR;
  const threeTwo = walk === CONTEXT_WALK.THREE_TWO;
  const files: Record<string, string> = {};
  const write = (relativePath: string, content: string): string => {
    const path = rootedSpecPath(relativePath);
    files[path] = content;
    return path;
  };
  const nodeDirectory = (order: number, nodeSlug: string): string => ordered(order, nodeSlug, grammar.nodeSuffix);
  const specName = (nodeSlug: string): string => `${nodeSlug}${grammar.specSuffix}`;
  const decisionName = (order: number, name: string): string => ordered(order, name, DECISION_SUFFIX);
  const decisionBody = (name: string): string => `# ${name}\n\n${openingParagraph("The", `${name} decision`)}`;
  const nodeBody = (nodeSlug: string, extra = ""): string =>
    `# ${nodeSlug}\n\n${openingParagraph(KIND_REGISTRY.capability.opening, nodeSlug)}${extra}`;

  const pathDirectory = nodeDirectory(CONTEXT_WALK_ORDER.PATH_CHILD, slug(SLUG_INDEX.PATH_NODE));
  const targetDirectory = join(pathDirectory, nodeDirectory(CONTEXT_WALK_ORDER.PATH_CHILD, slug(SLUG_INDEX.TARGET)));
  const rootSiblingDirectory = nodeDirectory(CONTEXT_WALK_ORDER.ROOT_SIBLING, slug(SLUG_INDEX.ROOT_SIBLING));
  const lowerDirectory = join(pathDirectory, nodeDirectory(CONTEXT_WALK_ORDER.LOWER, slug(SLUG_INDEX.LOWER)));

  const citedName = decisionName(CONTEXT_WALK_ORDER.BELOW_PATH_CHILD, `${slug(SLUG_INDEX.DECISION)}-cited`);
  const citedRelative = join(rootSiblingDirectory, citedName);
  const unresolvedRelative = join(
    rootSiblingDirectory,
    decisionName(MISSING_DECISION_ORDER, `${slug(SLUG_INDEX.DECISION)}-missing`),
  );

  const productSlug = slug(SLUG_INDEX.PRODUCT);
  const productFrontMatter = grammar.productDeclaresKind ? `---\nkind: ${SPEC_TREE_CONFIG.PRODUCT.KIND}\n---\n\n` : "";
  const product = write(`${productSlug}${grammar.productSuffix}`, `${productFrontMatter}# ${productSlug}\n`);
  const rootDecisionBelow = write(
    decisionName(CONTEXT_WALK_ORDER.BELOW_PATH_CHILD, `${slug(SLUG_INDEX.DECISION)}-root-below`),
    decisionBody("root below"),
  );
  const rootDecisionAbove = write(
    decisionName(CONTEXT_WALK_ORDER.ABOVE_PATH_CHILD, `${slug(SLUG_INDEX.DECISION)}-root-above`),
    decisionBody("root above"),
  );

  const pathNode = write(
    join(pathDirectory, specName(slug(SLUG_INDEX.PATH_NODE))),
    nodeBody(slug(SLUG_INDEX.PATH_NODE)),
  );
  const pathNodeIssues = write(join(pathDirectory, ISSUES), markdownFixtureBody("Open Issues"));
  const pathDecisionBelow = write(
    join(pathDirectory, decisionName(CONTEXT_WALK_ORDER.BELOW_PATH_CHILD, `${slug(SLUG_INDEX.DECISION)}-path-below`)),
    decisionBody("path below"),
  );
  const pathDecisionAbove = write(
    join(pathDirectory, decisionName(CONTEXT_WALK_ORDER.ABOVE_PATH_CHILD, `${slug(SLUG_INDEX.DECISION)}-path-above`)),
    decisionBody("path above"),
  );

  const citations = `\nGoverned by ${inlineCitation(rootedSpecPath(citedRelative))} and ${
    inlineCitation(rootedSpecPath(unresolvedRelative))
  }.\n`;
  const target = write(
    join(targetDirectory, specName(slug(SLUG_INDEX.TARGET))),
    nodeBody(slug(SLUG_INDEX.TARGET), citations),
  );
  const targetDecision = write(
    join(targetDirectory, decisionName(CONTEXT_WALK_ORDER.TARGET_DECISION, `${slug(SLUG_INDEX.DECISION)}-target`)),
    decisionBody("target"),
  );
  const targetChild = write(
    join(
      targetDirectory,
      nodeDirectory(CONTEXT_WALK_ORDER.LOWER, slug(SLUG_INDEX.CHILD)),
      specName(slug(SLUG_INDEX.CHILD)),
    ),
    nodeBody(slug(SLUG_INDEX.CHILD)),
  );
  const targetKnowledgeIndex = write(join(targetDirectory, KNOWLEDGE_INDEX), markdownFixtureBody("Knowledge"));
  const targetKnowledgeBody = write(
    join(targetDirectory, KNOWLEDGE_DIRECTORY, `${slug(SLUG_INDEX.DECISION)}-entry.md`),
    markdownFixtureBody("Knowledge entry"),
  );

  const lowerSibling = write(
    join(lowerDirectory, specName(slug(SLUG_INDEX.LOWER))),
    nodeBody(slug(SLUG_INDEX.LOWER)),
  );
  const outcomeRecord = write(
    join(lowerDirectory, `${slug(SLUG_INDEX.LOWER)}${SPEC_CONTEXT_OPTIONAL_ARTIFACT.OUTCOME_SUFFIX}`),
    markdownFixtureBody("Outcome"),
  );
  const sameIndexSibling = threeTwo
    ? write(
      join(
        pathDirectory,
        nodeDirectory(CONTEXT_WALK_ORDER.PATH_CHILD, slug(SLUG_INDEX.SAME)),
        specName(slug(SLUG_INDEX.SAME)),
      ),
      nodeBody(slug(SLUG_INDEX.SAME)),
    )
    : undefined;
  const higherIndexSibling = threeTwo
    ? write(
      join(
        pathDirectory,
        nodeDirectory(CONTEXT_WALK_ORDER.ABOVE_PATH_CHILD, slug(SLUG_INDEX.HIGHER)),
        specName(slug(SLUG_INDEX.HIGHER)),
      ),
      nodeBody(slug(SLUG_INDEX.HIGHER)),
    )
    : undefined;

  const rootSibling = write(
    join(rootSiblingDirectory, specName(slug(SLUG_INDEX.ROOT_SIBLING))),
    nodeBody(slug(SLUG_INDEX.ROOT_SIBLING)),
  );
  const citedDecision = write(citedRelative, decisionBody("cited"));
  const unresolvedCitation = rootedSpecPath(unresolvedRelative);

  const readSet: readonly string[] = threeTwo
    ? [
      product,
      rootDecisionBelow,
      rootDecisionAbove,
      pathNode,
      pathDecisionBelow,
      pathDecisionAbove,
      pathNodeIssues,
      lowerSibling,
      target,
      targetDecision,
      citedDecision,
    ]
    : [
      product,
      rootDecisionBelow,
      pathNode,
      pathNodeIssues,
      lowerSibling,
      pathDecisionBelow,
      target,
      targetKnowledgeIndex,
      targetChild,
      targetDecision,
      rootSibling,
      citedDecision,
    ];

  const roles: Record<ContextWalkRole, string> = {
    [CONTEXT_WALK_ROLE.PRODUCT]: product,
    [CONTEXT_WALK_ROLE.ROOT_DECISION_BELOW]: rootDecisionBelow,
    [CONTEXT_WALK_ROLE.ROOT_DECISION_ABOVE]: rootDecisionAbove,
    [CONTEXT_WALK_ROLE.PATH_NODE]: pathNode,
    [CONTEXT_WALK_ROLE.PATH_NODE_ISSUES]: pathNodeIssues,
    [CONTEXT_WALK_ROLE.PATH_DECISION_BELOW]: pathDecisionBelow,
    [CONTEXT_WALK_ROLE.PATH_DECISION_ABOVE]: pathDecisionAbove,
    [CONTEXT_WALK_ROLE.TARGET]: target,
    [CONTEXT_WALK_ROLE.TARGET_DECISION]: targetDecision,
    [CONTEXT_WALK_ROLE.TARGET_CHILD]: targetChild,
    [CONTEXT_WALK_ROLE.TARGET_KNOWLEDGE_INDEX]: targetKnowledgeIndex,
    [CONTEXT_WALK_ROLE.TARGET_KNOWLEDGE_BODY]: targetKnowledgeBody,
    [CONTEXT_WALK_ROLE.LOWER_SIBLING]: lowerSibling,
    [CONTEXT_WALK_ROLE.SAME_INDEX_SIBLING]: sameIndexSibling ?? "",
    [CONTEXT_WALK_ROLE.HIGHER_INDEX_SIBLING]: higherIndexSibling ?? "",
    [CONTEXT_WALK_ROLE.OUTCOME_SIBLING_RECORD]: outcomeRecord,
    [CONTEXT_WALK_ROLE.ROOT_SIBLING]: rootSibling,
    [CONTEXT_WALK_ROLE.CITED_DECISION]: citedDecision,
    [CONTEXT_WALK_ROLE.UNRESOLVED_CITATION]: unresolvedCitation,
  };

  return {
    declaration,
    walk,
    methodology: declarationMethodology(declaration),
    files,
    roles,
    probes: [{ target: rootedSpecPath(targetDirectory), readSet, unresolved: [unresolvedCitation] }],
  };
}

/** The three context-walk fixture products, one per declaration, drawn from one slug set. */
export function contextWalkFixtures(slugs: readonly string[]): readonly ContextWalkFixture[] {
  return Object.values(CONTEXT_WALK_DECLARATION).map((declaration) => contextWalkFixture(declaration, slugs));
}

const ROOT_SEGMENT_COUNT = 1;
const OWN_ARTIFACT_RANK = { SPEC: -4, ISSUES: -3, OUTCOME: -2, KNOWLEDGE: -1 } as const;
const INLINE_LINK_TARGET = /\]\(([^)]+)\)/g;

export function segmentsOf(path: string): readonly string[] {
  return path.split(SEPARATOR).slice(ROOT_SEGMENT_COUNT);
}

export function leadingIndex(segment: string): number {
  return Number.parseInt(segment.split(SPEC_TREE_GRAMMAR.ORDER.SEPARATOR)[0], 10);
}

function isDecision(name: string): boolean {
  return [KIND_REGISTRY.adr.suffix, KIND_REGISTRY.pdr.suffix].some((suffix) => name.endsWith(suffix));
}

/** The position of an entry in the product-tree walk: each directory contributes its own artifacts, then decisions and child nodes by index. */
export function walkKey(path: string): readonly (readonly [number, string])[] {
  const segments = segmentsOf(path);
  return segments.map((segment, position) => {
    const isFile = position === segments.length - 1;
    if (segment === SPEC_TREE_GRAMMAR.KNOWLEDGE.DIRECTORY_NAME) return [OWN_ARTIFACT_RANK.KNOWLEDGE, segment];
    if (isDecision(segment) || !isFile) return [leadingIndex(segment), segment];
    if (segment === SPEC_TREE_GRAMMAR.KNOWLEDGE.INDEX_FILENAME) return [0, segment];
    if (segment === SPEC_TREE_GRAMMAR.COORDINATION_NOTE.ISSUES) return [OWN_ARTIFACT_RANK.ISSUES, segment];
    if (segment.endsWith(SPEC_TREE_GRAMMAR.OUTCOME_RECORD.SUFFIX)) return [OWN_ARTIFACT_RANK.OUTCOME, segment];
    return [OWN_ARTIFACT_RANK.SPEC, segment];
  });
}

export function compareWalkKeys(
  left: readonly (readonly [number, string])[],
  right: readonly (readonly [number, string])[],
): number {
  for (let position = 0; position < Math.min(left.length, right.length); position += 1) {
    const [leftIndex, leftName] = left[position];
    const [rightIndex, rightName] = right[position];
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    if (leftName !== rightName) return leftName < rightName ? -1 : 1;
  }
  return left.length - right.length;
}

/** The targets of the Markdown inline links a document carries. */
export function contextWalkCitations(content: string): readonly string[] {
  return [...content.matchAll(INLINE_LINK_TARGET)].map((match) => match[1]);
}
