import {
  KIND_REGISTRY,
  renderSpecTreeRootFrontMatter,
  SPEC_TREE_CONFIG,
  SPEC_TREE_FRONT_MATTER_FENCE,
  SPEC_TREE_FRONT_MATTER_ID_KEY,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_METHODOLOGY_LINE,
} from "@/lib/spec-tree";
import {
  orderIndexText,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";

/**
 * One product tree whose two sibling node directories and two root decision files carry a lower
 * and a higher index, the lower a provider of the higher by the index semantics of the tree's
 * methodology line: under 3.x segments compare numerically, so `2.9` sits below `2.10`; under 4.0
 * an index sits below the index that extends it, so `20.10` sits below `20.10.05`.
 */
export type SegmentOrderGovernanceCase = {
  readonly title: string;
  readonly line: string;
  readonly lowerIndex: string;
  readonly higherIndex: string;
  /** Tree-root-relative directory name of the node carrying the lower index. */
  readonly lowerTarget: string;
  /** Tree-root-relative directory name of the node carrying the higher index. */
  readonly higherTarget: string;
  readonly lowerSpecPath: string;
  readonly higherSpecPath: string;
  /** Product-relative path of the root decision carrying the lower index. */
  readonly lowerDecisionPath: string;
  /** Product-relative path of the root decision carrying the higher index. */
  readonly higherDecisionPath: string;
  /** Every file of the tree: its product-relative path and exact text. */
  readonly files: Readonly<Record<string, string>>;
};

type LineScope = {
  readonly line: string;
  readonly isOutputGrammar: boolean;
  readonly nodeSuffix: string;
  readonly nodeOpening: string;
  readonly decisionSuffix: string;
  readonly lowerIndex: string;
  readonly higherIndex: string;
  readonly specSuffix: string;
};

/** The 4.0 fractional segment that extends the lower index into the higher one; two digits wide. */
const FOUR_ZERO_EXTENSION_SEGMENT = "05";

const LINE_SCOPES: readonly LineScope[] = [
  {
    line: SPEC_TREE_METHODOLOGY_LINE.THREE_TWO,
    isOutputGrammar: false,
    nodeSuffix: KIND_REGISTRY.enabler.suffix,
    nodeOpening: KIND_REGISTRY.enabler.opening,
    decisionSuffix: KIND_REGISTRY.adr.suffix,
    lowerIndex: orderIndexText([2, 9]),
    higherIndex: orderIndexText([2, 10]),
    specSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX,
  },
  {
    line: SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO,
    isOutputGrammar: true,
    nodeSuffix: KIND_REGISTRY.capability.suffix,
    nodeOpening: KIND_REGISTRY.capability.opening,
    decisionSuffix: KIND_REGISTRY.pdr.suffix,
    lowerIndex: orderIndexText([20, 10]),
    higherIndex: [orderIndexText([20, 10]), FOUR_ZERO_EXTENSION_SEGMENT].join(
      SPEC_TREE_GRAMMAR.ORDER.SEGMENT_SEPARATOR,
    ),
    specSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX,
  },
];

function statement(title: string): string {
  return `# ${title}\n\nGenerated fixture content governs spec-tree tests\nthat read current nodes.\n`;
}

function nodeText(scope: LineScope, title: string): string {
  const body =
    `# ${title}\n\n${scope.nodeOpening} generated fixture content\nSO THAT spec-tree tests\nCAN read current nodes\n`;
  if (!scope.isOutputGrammar) return body;
  const id = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceId());
  return [
    SPEC_TREE_FRONT_MATTER_FENCE,
    `${SPEC_TREE_FRONT_MATTER_ID_KEY}: ${id}`,
    SPEC_TREE_FRONT_MATTER_FENCE,
    "",
    body,
  ].join("\n");
}

function productText(scope: LineScope, title: string): string {
  if (!scope.isOutputGrammar) return statement(title);
  const id = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceId());
  return `${renderSpecTreeRootFrontMatter({ id })}\n${statement(title)}`;
}

/** One tree per methodology line, each holding two nodes and two root decisions at a lower and a higher index. */
export function segmentOrderGovernanceCases(): readonly SegmentOrderGovernanceCase[] {
  const root = SPEC_TREE_CONFIG.ROOT_DIRECTORY;
  const path = (...segments: readonly string[]): string => segments.join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
  const named = (index: string, slug: string, suffix: string): string =>
    `${index}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${suffix}`;
  return LINE_SCOPES.map((scope) => {
    const [productSlug, lowerSlug, higherSlug, lowerDecisionSlug, higherDecisionSlug] = [0, 1, 2, 3, 4].map(
      (position) => `${sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), position)}${position}`,
    );
    const lowerTarget = named(scope.lowerIndex, lowerSlug, scope.nodeSuffix);
    const higherTarget = named(scope.higherIndex, higherSlug, scope.nodeSuffix);
    const lowerSpecPath = path(root, lowerTarget, `${lowerSlug}${scope.specSuffix}`);
    const higherSpecPath = path(root, higherTarget, `${higherSlug}${scope.specSuffix}`);
    const lowerDecisionPath = path(root, named(scope.lowerIndex, lowerDecisionSlug, scope.decisionSuffix));
    const higherDecisionPath = path(root, named(scope.higherIndex, higherDecisionSlug, scope.decisionSuffix));
    const productPath = path(
      root,
      `${productSlug}${
        scope.isOutputGrammar ? SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX : SPEC_TREE_CONFIG.PRODUCT.SUFFIX
      }`,
    );
    return {
      title: `methodology line ${scope.line}: index ${scope.lowerIndex} below index ${scope.higherIndex}`,
      line: scope.line,
      lowerIndex: scope.lowerIndex,
      higherIndex: scope.higherIndex,
      lowerTarget,
      higherTarget,
      lowerSpecPath,
      higherSpecPath,
      lowerDecisionPath,
      higherDecisionPath,
      files: {
        [productPath]: productText(scope, productSlug),
        [lowerSpecPath]: nodeText(scope, lowerSlug),
        [higherSpecPath]: nodeText(scope, higherSlug),
        [lowerDecisionPath]: statement(lowerDecisionSlug),
        [higherDecisionPath]: statement(higherDecisionSlug),
      },
    };
  });
}
