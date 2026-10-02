import { parse } from "node:path";

import * as fc from "fast-check";

import {
  type DecisionKind,
  KIND_REGISTRY,
  type NodeKind,
  SPEC_CONTEXT_DOCUMENT_OPENING,
  SPEC_CONTEXT_ENTRY_TYPE,
  SPEC_CONTEXT_FRAME,
  SPEC_CONTEXT_LIFECYCLE_OVERLAY_PATH,
  SPEC_CONTEXT_LISTED_ROLE,
  SPEC_CONTEXT_OPTIONAL_ARTIFACT,
  SPEC_CONTEXT_READ_ROLE,
  SPEC_CONTEXT_SELECTED_METADATA_KEY,
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
  type SpecContextEntry,
  type SpecContextListedRole,
  type SpecContextReadRole,
} from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  specContextLowerSiblingDirectoryName,
  specContextSameIndexSiblingDirectoryName,
} from "@testing/generators/spec-tree/context-target";
import {
  type RepresentativeSpecTreeFixture,
  SPEC_TREE_TEST_GENERATOR,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";

/** The tree-rooted form of a node id or tree-relative artifact path, projected from the grammar. */
export function rootedSpecPath(relativePath: string): string {
  return `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}${relativePath}`;
}

/** A node's spec file under the tree root, in the prior `{slug}.md` form the fixture materializes. */
export function specFilePath(directory: string, slug: string): string {
  return rootedSpecPath(
    [directory, `${slug}${SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX}`].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
  );
}

/** Any co-located artifact of a node directory under the tree root, or a file at the root when `directory` is undefined. */
export function rootedArtifactPath(directory: string | undefined, filename: string): string {
  return rootedSpecPath(
    directory === undefined ? filename : [directory, filename].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
  );
}

/** A decision file under the tree root or under `directory`, named by order, slug, and kind suffix. */
function decisionFilePath(directory: string | undefined, order: number, slug: string, suffix: string): string {
  return rootedArtifactPath(directory, `${order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${suffix}`);
}

/** The first index above every index the fixture's own nodes occupy, so a new sibling collides with none. */
export function freeSiblingOrder(fixture: RepresentativeSpecTreeFixture): number {
  return Math.max(fixture.root.order, fixture.peer.order) + 1;
}

/** A sibling node directory at `order` carrying `slug`, in the kind the fixture's own root declares. */
export function siblingDirectoryName(fixture: RepresentativeSpecTreeFixture, order: number, slug: string): string {
  return specTreeFixtureNodeDirectoryName(KIND_REGISTRY, { ...fixture.root, order, slug });
}

/** The spec path of a new top-level node of `kind` at the first free index, so it collides with no fixture node. */
export function freeNodeSpecPath(fixture: RepresentativeSpecTreeFixture, kind: NodeKind, slug: string): string {
  const directory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, {
    ...fixture.root,
    kind,
    order: freeSiblingOrder(fixture),
    slug,
  });
  return specFilePath(directory, slug);
}

/** The path of a new product-root decision of `kind` at the first free index, so it collides with no fixture entry. */
export function freeDecisionPath(fixture: RepresentativeSpecTreeFixture, kind: DecisionKind, slug: string): string {
  return decisionFilePath(undefined, freeSiblingOrder(fixture), slug, KIND_REGISTRY[kind].suffix);
}

/** The body a fixture spec carries: its own title and the opening its kind declares. */
export function specFixtureBody(slug: string, opening: string): string {
  return `# ${slug}\n\n${opening} ${slug}\n`;
}

/** The body a fixture overlay or note carries: its own title and nothing the projection reads. */
export function markdownFixtureBody(title: string): string {
  return `# ${title}\n`;
}

/** One opening paragraph as the Digest projection selects it: keyword, subject, and its closing line ending. */
export function openingParagraph(keyword: string, subject: string): string {
  return `${keyword} ${subject}\nSO THAT readers\nCAN find it\n`;
}

/** A Markdown inline link to `path`, the one citation shape context projection binds. */
export function inlineCitation(path: string): string {
  return `[${parse(path).name}](${path})`;
}

/** Filename of the escape-target fixture a containment scenario writes outside the probed boundary. */
export const SPEC_CONTEXT_ESCAPE_TARGET_FILENAME = "outside-secret.md";

/**
 * A name pair whose code-unit order is the opposite of its locale order:
 * distinct leading letters — never a case-only difference, which collides on
 * case-insensitive filesystems — where "Z" precedes "a" by code units while
 * locale collation orders "a" before "Z".
 */
export type DivergentOrderSlugPair = { readonly codeUnitFirst: string; readonly localeFirst: string };

function divergentOrderSlugPairFrom(slug: string): DivergentOrderSlugPair {
  const codeUnitFirst = `Z${slug}`;
  const localeFirst = `a${slug}`;
  if (!(codeUnitFirst < localeFirst) || codeUnitFirst.localeCompare(localeFirst) <= 0) {
    throw new Error("Expected a slug pair whose code-unit order diverges from its locale order");
  }
  return { codeUnitFirst, localeFirst };
}

export function arbitraryDivergentOrderSlugPair(): fc.Arbitrary<DivergentOrderSlugPair> {
  return SPEC_TREE_TEST_GENERATOR.sourceSlug().map(divergentOrderSlugPairFrom);
}

/** One divergent pair drawn under the pinned seed, shared by every ordering assertion. */
export function divergentOrderSlugPair(): DivergentOrderSlugPair {
  return sampleGeneratedValue(arbitraryDivergentOrderSlugPair());
}

/** UTF-8 byte-order mark: the fixture leads with it so BOM stripping or a wrong-encoding decode is caught. */
const BYTE_ORDER_MARK = "﻿";

/** Paths and exact texts of the fully populated context fixture. */
export interface RichContextPaths {
  readonly targetId: string;
  /** A node one level below the target, past the targetless walk's depth bound. */
  readonly deepDescendantId: string;
  readonly deepDescendantSpecPath: string;
  /** An eval artifact and a probe protocol under the target, beside its tests. */
  readonly targetEvalPath: string;
  readonly targetProbePath: string;
  readonly rootDirectory: string;
  readonly productPath: string;
  readonly rootSpecPath: string;
  readonly targetSpecPath: string;
  readonly ancestorDecisionPath: string;
  /** A decision directly contained by the depth-2 target node. */
  readonly targetDecisionPath: string;
  readonly higherAncestorDecisionPath: string;
  readonly higherProductDecisionPath: string;
  readonly lowerSiblingDirectory: string;
  readonly lowerSiblingSpecPath: string;
  /** An outcome record and a knowledge index under the lower sibling, which is never an explicit target. */
  readonly lowerSiblingOutcomePath: string;
  readonly lowerSiblingKnowledgeIndexPath: string;
  readonly citedDecisionPath: string;
  readonly transitiveCitedDecisionPath: string;
  readonly evidencePath: string;
  readonly rootPlanPath: string;
  readonly rootIssuesPath: string;
  readonly ancestorPlanPath: string;
  /** The issue note of the depth-1 ancestor, between the product root's and the target's. */
  readonly ancestorIssuesPath: string;
  readonly targetIssuesPath: string;
  /**
   * Exact text written to the target ISSUES note; carries a leading byte-order
   * mark and multi-byte UTF-8 so BOM stripping or a wrong-encoding decode is
   * caught.
   */
  readonly targetIssuesText: string;
  /** The note's heading line without the byte-order mark: the text a leak of the note's body would carry. */
  readonly targetIssuesHeading: string;
  readonly rootGuidePaths: readonly string[];
  readonly ancestorGuidePath: string;
  readonly lifecycleOverlayPath: string;
  readonly listedOverlayPath: string;
  readonly sameIndexSiblingPath: string;
  readonly sameIndexSiblingSpecPath: string;
  readonly higherIndexSiblingPath: string;
  readonly higherIndexSiblingSpecPath: string;
  readonly peerDecisionPath: string;
  /** The nested target's outcome record, selected in Full only for an explicit target. */
  readonly targetOutcomePath: string;
  /** Knowledge indexes at the product root and the nested target, referenced only for explicit targets. */
  readonly rootKnowledgeIndexPath: string;
  readonly targetKnowledgeIndexPath: string;
  /** Exact source text of the documents the `show` projection selects, keyed by path. */
  readonly sourceText: Readonly<Record<string, string>>;
  /** The source text after its front matter — the Full content — for the documents that carry front matter. */
  readonly bodyText: Readonly<Record<string, string>>;
  /** The front-matter selection the target spec projects: its one selected key and drawn value. */
  readonly targetSelectedMetadata: Readonly<Record<string, string>>;
  /** The opening paragraph each Digest-selectable document carries, keyed by path. */
  readonly openingText: Readonly<Record<string, string>>;
}

/** The complete generated rich-context scenario: the fixture tree, its paths, and every file it materializes. */
export interface RichContextScenario {
  readonly fixture: RepresentativeSpecTreeFixture;
  readonly paths: RichContextPaths;
  /** Every product-relative file the scenario writes beyond the materialized fixture, with its exact text. */
  readonly files: Readonly<Record<string, string>>;
}

const RICH_CONTEXT_TOKEN_COUNT = 9;

type RichContextDraws = {
  readonly fixture: RepresentativeSpecTreeFixture;
  readonly tokens: readonly string[];
  readonly evidenceFileName: string;
};

function richContextScenario({ fixture, tokens, evidenceFileName }: RichContextDraws): RichContextScenario {
  const [
    evidenceSlug,
    selectedValue,
    unselectedKey,
    overlaySlug,
    pairSlug,
    prose,
    unscannedSlug,
    noteToken,
    guideToken,
  ] = tokens as readonly [string, string, string, string, string, string, string, string, string];
  const rootDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.root);
  const childDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.child);
  const peerDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.peer);
  const lowerSiblingDirectory = specContextLowerSiblingDirectoryName(fixture);
  const targetId = [rootDirectory, childDirectory].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
  // One level below the target, so the targetless walk's depth bound
  // excludes it while a targeted projection of the target includes it.
  const deepDescendantSlug = `${fixture.child.slug}-deep`;
  const deepDescendantDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, {
    ...fixture.child,
    slug: deepDescendantSlug,
  });
  const deepDescendantId = [targetId, deepDescendantDirectory].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
  const deepDescendantSpecPath = specFilePath(deepDescendantId, deepDescendantSlug);
  const decisionSuffix = KIND_REGISTRY[fixture.decision.kind].suffix;
  const productPath = rootedArtifactPath(undefined, `${fixture.product.title}${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}`);
  const rootSpecPath = specFilePath(rootDirectory, fixture.root.slug);
  const targetSpecPath = specFilePath(targetId, fixture.child.slug);
  const ancestorDecisionPath = decisionFilePath(
    rootDirectory,
    fixture.decision.order,
    fixture.decision.slug,
    decisionSuffix,
  );
  // A decision directly contained by the depth-2 target, so targetless
  // discovery carries a decision at each declared depth.
  const targetDecisionPath = decisionFilePath(targetId, fixture.decision.order, fixture.decision.slug, decisionSuffix);
  const higherAncestorDecisionPath = decisionFilePath(
    rootDirectory,
    fixture.peer.order,
    fixture.decision.slug,
    decisionSuffix,
  );
  const higherProductDecisionPath = decisionFilePath(
    undefined,
    fixture.peer.order,
    fixture.decision.slug,
    decisionSuffix,
  );
  const lowerSiblingSpecPath = specFilePath(lowerSiblingDirectory, fixture.root.slug);
  // The two decisions the walk appends share one index and take their slugs
  // from the divergent pair, so their canonical order is the reverse of
  // their locale order and an ordering assertion over them fails under a
  // locale-aware comparator instead of varying by host.
  const appendedPair = divergentOrderSlugPairFrom(pairSlug);
  const citedDecisionPath = decisionFilePath(
    peerDirectory,
    fixture.decision.order,
    `${appendedPair.codeUnitFirst}-cited`,
    decisionSuffix,
  );
  const transitiveCitedDecisionPath = decisionFilePath(
    peerDirectory,
    fixture.peer.order,
    `${fixture.decision.slug}-transitive`,
    decisionSuffix,
  );
  const sameIndexSiblingDirectory = specContextSameIndexSiblingDirectoryName(fixture);
  const sameIndexSiblingSpecPath = specFilePath(sameIndexSiblingDirectory, `${fixture.root.slug}-same`);
  const higherIndexSiblingSpecPath = specFilePath(peerDirectory, fixture.peer.slug);
  const peerDecisionPath = decisionFilePath(
    peerDirectory,
    fixture.decision.order,
    `${appendedPair.localeFirst}-peer`,
    decisionSuffix,
  );
  const targetOutcomePath = rootedArtifactPath(
    targetId,
    `${fixture.child.slug}${SPEC_CONTEXT_OPTIONAL_ARTIFACT.OUTCOME_SUFFIX}`,
  );
  const lowerSiblingOutcomePath = rootedArtifactPath(
    lowerSiblingDirectory,
    `${fixture.root.slug}${SPEC_CONTEXT_OPTIONAL_ARTIFACT.OUTCOME_SUFFIX}`,
  );
  const rootOpening = KIND_REGISTRY[fixture.root.kind].opening;
  const openingText: Record<string, string> = {
    [productPath]: openingParagraph(SPEC_CONTEXT_DOCUMENT_OPENING.PRODUCT, `${fixture.product.title} — Übersicht ✓`),
    [rootSpecPath]: openingParagraph(rootOpening, fixture.root.slug),
    [targetSpecPath]: openingParagraph(
      KIND_REGISTRY[fixture.child.kind].opening,
      `${fixture.child.slug} under ${inlineCitation(peerDecisionPath)}`,
    ),
    [lowerSiblingSpecPath]: openingParagraph(rootOpening, `${prose} lower sibling`),
    [sameIndexSiblingSpecPath]: openingParagraph(rootOpening, `${prose} same sibling`),
    [higherIndexSiblingSpecPath]: openingParagraph(KIND_REGISTRY[fixture.peer.kind].opening, fixture.peer.slug),
    [ancestorDecisionPath]: openingParagraph(SPEC_CONTEXT_DOCUMENT_OPENING.DECISION, `${prose} ancestor subtree`),
    [targetDecisionPath]: openingParagraph(SPEC_CONTEXT_DOCUMENT_OPENING.DECISION, `${prose} target node`),
    [higherAncestorDecisionPath]: openingParagraph(
      SPEC_CONTEXT_DOCUMENT_OPENING.DECISION,
      `${prose} higher ancestor siblings`,
    ),
    [higherProductDecisionPath]: openingParagraph(
      SPEC_CONTEXT_DOCUMENT_OPENING.DECISION,
      `${prose} higher product siblings`,
    ),
    [citedDecisionPath]: openingParagraph(SPEC_CONTEXT_DOCUMENT_OPENING.DECISION, `${prose} cited concern`),
    [transitiveCitedDecisionPath]: openingParagraph(
      SPEC_CONTEXT_DOCUMENT_OPENING.DECISION,
      `${prose} transitive concern`,
    ),
    [peerDecisionPath]: openingParagraph(SPEC_CONTEXT_DOCUMENT_OPENING.DECISION, `${prose} peer subtree`),
    [deepDescendantSpecPath]: openingParagraph(KIND_REGISTRY[fixture.child.kind].opening, deepDescendantSlug),
  };
  // The nested target, the lower sibling, and the cited decision carry
  // inline-link citations; the target's Digest opening cites the peer
  // decision so a Digest opening contributes a citation too.
  const bodyText: Record<string, string> = {
    [targetSpecPath]: `\n# ${fixture.child.slug}\n\n${openingText[targetSpecPath]}\nGoverned by ${
      inlineCitation(citedDecisionPath)
    }.\n`,
    [targetOutcomePath]: `\n# ${fixture.child.slug} outcome\n\nMoves ${prose}.\n`,
    [lowerSiblingOutcomePath]: `\n# ${fixture.root.slug} lower outcome\n\nMoves ${prose} below.\n`,
  };
  // The target's front matter carries the one selected key beside an
  // unselected one; both values are drawn, so the projection cannot pass by
  // echoing a fixed vocabulary.
  const targetSelectedMetadata = { [SPEC_CONTEXT_SELECTED_METADATA_KEY]: selectedValue };
  const sourceText: Record<string, string> = {
    [productPath]: `# ${fixture.product.title}\n\n${openingText[productPath]}\n${prose} guidance.\n`,
    [rootSpecPath]: `# ${fixture.root.slug}\n\n${openingText[rootSpecPath]}\n## Assertions\n\n- ${prose} rule.\n`,
    [targetSpecPath]:
      `---\n${SPEC_CONTEXT_SELECTED_METADATA_KEY}: ${selectedValue}\n${unselectedKey}: ${noteToken}\n---\n${
        bodyText[targetSpecPath]
      }`,
    [lowerSiblingSpecPath]: `# Lower sibling\n\n${openingText[lowerSiblingSpecPath]}\nAlso governed by ${
      inlineCitation(citedDecisionPath)
    }.\n`,
    [sameIndexSiblingSpecPath]: `# Same sibling\n\n${openingText[sameIndexSiblingSpecPath]}`,
    [higherIndexSiblingSpecPath]: `# ${fixture.peer.slug}\n\n${openingText[higherIndexSiblingSpecPath]}`,
    [deepDescendantSpecPath]: `# ${deepDescendantSlug}\n\n${openingText[deepDescendantSpecPath]}`,
    [ancestorDecisionPath]: `# Ancestor decision\n\n${openingText[ancestorDecisionPath]}\n## Rationale\n\n${prose}.\n`,
    [targetDecisionPath]: `# Target decision\n\n${openingText[targetDecisionPath]}`,
    [higherAncestorDecisionPath]: `# Higher ancestor decision\n\n${openingText[higherAncestorDecisionPath]}`,
    [higherProductDecisionPath]: `# Higher product decision\n\n${openingText[higherProductDecisionPath]}`,
    [citedDecisionPath]: `# Cited decision\n\n${openingText[citedDecisionPath]}\nRefines ${
      inlineCitation(transitiveCitedDecisionPath)
    } and cites ${inlineCitation(citedDecisionPath)} itself.\n`,
    [transitiveCitedDecisionPath]: `# Transitive cited decision\n\n${openingText[transitiveCitedDecisionPath]}`,
    [peerDecisionPath]: `# Peer decision\n\n${openingText[peerDecisionPath]}`,
    [targetOutcomePath]: `---\nid: ${fixture.child.slug}\n---\n${bodyText[targetOutcomePath]}`,
    [lowerSiblingOutcomePath]: `---\nid: ${fixture.root.slug}\n---\n${bodyText[lowerSiblingOutcomePath]}`,
  };
  const targetIssuesHeading = `# Target issues ${noteToken} — Prüfung ✓ 文脈`;

  const paths: RichContextPaths = {
    targetId,
    deepDescendantId,
    deepDescendantSpecPath,
    targetEvalPath: rootedArtifactPath(
      [targetId, SPEC_TREE_GRAMMAR.EVAL.DIRECTORY_NAME, evidenceSlug].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
      SPEC_TREE_GRAMMAR.EVAL.FILES[0],
    ),
    targetProbePath: rootedArtifactPath(
      [targetId, SPEC_TREE_GRAMMAR.PROBE.DIRECTORY_NAME, evidenceSlug].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
      SPEC_TREE_GRAMMAR.PROBE.PROTOCOL_FILENAME,
    ),
    rootDirectory,
    productPath,
    rootSpecPath,
    targetSpecPath,
    ancestorDecisionPath,
    targetDecisionPath,
    higherAncestorDecisionPath,
    higherProductDecisionPath,
    lowerSiblingDirectory,
    lowerSiblingSpecPath,
    lowerSiblingOutcomePath,
    lowerSiblingKnowledgeIndexPath: rootedArtifactPath(
      lowerSiblingDirectory,
      SPEC_CONTEXT_OPTIONAL_ARTIFACT.KNOWLEDGE_INDEX,
    ),
    citedDecisionPath,
    transitiveCitedDecisionPath,
    evidencePath: rootedArtifactPath(
      [targetId, SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
      evidenceFileName,
    ),
    rootPlanPath: rootedArtifactPath(undefined, SPEC_TREE_GRAMMAR.COORDINATION_NOTE.PLAN),
    rootIssuesPath: rootedArtifactPath(undefined, SPEC_TREE_GRAMMAR.COORDINATION_NOTE.ISSUES),
    ancestorPlanPath: rootedArtifactPath(rootDirectory, SPEC_TREE_GRAMMAR.COORDINATION_NOTE.PLAN),
    ancestorIssuesPath: rootedArtifactPath(rootDirectory, SPEC_TREE_GRAMMAR.COORDINATION_NOTE.ISSUES),
    targetIssuesPath: rootedArtifactPath(targetId, SPEC_TREE_GRAMMAR.COORDINATION_NOTE.ISSUES),
    targetIssuesText: `${BYTE_ORDER_MARK}${targetIssuesHeading}\n`,
    targetIssuesHeading,
    rootGuidePaths: [...SPEC_TREE_GRAMMAR.GUIDE_FILES],
    ancestorGuidePath: rootedArtifactPath(rootDirectory, SPEC_TREE_GRAMMAR.GUIDE_FILES[0]),
    lifecycleOverlayPath: SPEC_CONTEXT_LIFECYCLE_OVERLAY_PATH,
    listedOverlayPath: rootedArtifactPath(
      SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.DIRECTORY_NAME,
      `${overlaySlug}${SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.EXTENSION}`,
    ),
    sameIndexSiblingPath: rootedSpecPath(sameIndexSiblingDirectory),
    sameIndexSiblingSpecPath,
    higherIndexSiblingPath: rootedSpecPath(peerDirectory),
    higherIndexSiblingSpecPath,
    peerDecisionPath,
    targetOutcomePath,
    rootKnowledgeIndexPath: rootedArtifactPath(undefined, SPEC_CONTEXT_OPTIONAL_ARTIFACT.KNOWLEDGE_INDEX),
    targetKnowledgeIndexPath: rootedArtifactPath(targetId, SPEC_CONTEXT_OPTIONAL_ARTIFACT.KNOWLEDGE_INDEX),
    sourceText,
    bodyText,
    targetSelectedMetadata,
    openingText,
  };

  // The product-root plan names a citation-shaped decision path no tracked
  // file satisfies, so a coordination note that bound citations would fail
  // the projection.
  const unscannedDecisionPath = decisionFilePath(
    undefined,
    fixture.peer.order,
    unscannedSlug,
    KIND_REGISTRY.pdr.suffix,
  );
  const files: Record<string, string> = {
    ...sourceText,
    [paths.evidencePath]: `import { describe, it } from "vitest";\n// ${evidenceSlug}\n`,
    [paths.rootPlanPath]: `# Plan\n\nMentions ${unscannedDecisionPath} without binding it.\n`,
    [paths.rootIssuesPath]: markdownFixtureBody(`Issues ${noteToken}`),
    [paths.ancestorPlanPath]: markdownFixtureBody(`Ancestor plan ${noteToken}`),
    [paths.ancestorIssuesPath]: markdownFixtureBody(`Ancestor issues ${noteToken}`),
    [paths.targetEvalPath]: `[case]\nid = "${evidenceSlug}"\n`,
    [paths.targetProbePath]: markdownFixtureBody(`Probe ${evidenceSlug}`),
    [paths.targetIssuesPath]: paths.targetIssuesText,
    ...Object.fromEntries(paths.rootGuidePaths.map((guidePath) => [guidePath, markdownFixtureBody(guideToken)])),
    [paths.ancestorGuidePath]: markdownFixtureBody(`Ancestor ${guideToken}`),
    [paths.lifecycleOverlayPath]: markdownFixtureBody(`Lifecycle overlay ${overlaySlug}`),
    [paths.listedOverlayPath]: markdownFixtureBody(`Listed overlay ${overlaySlug}`),
    [paths.rootKnowledgeIndexPath]: markdownFixtureBody(`Root knowledge ${noteToken}`),
    [paths.targetKnowledgeIndexPath]: markdownFixtureBody(`Target knowledge ${noteToken}`),
    [paths.lowerSiblingKnowledgeIndexPath]: markdownFixtureBody(`Lower sibling knowledge ${noteToken}`),
  };

  return { fixture, paths, files };
}

/**
 * A spec tree exercising every manifest role at once: nested target with
 * ancestor, decisions above and below the constraining order, a lower-index
 * sibling that also cites the shared decision and carries its own outcome
 * record and knowledge index, coordination notes at each depth, runtime
 * guides, both overlay classes, co-located evidence, and a transitive
 * cited-decision chain rooted in the target spec. The root node directory is a
 * second resolvable target sharing the product spec, the root spec, and the
 * ancestor decision with the nested target, so multi-target composition
 * exercises real shared documents.
 */
export function arbitraryRichContextScenario(): fc.Arbitrary<RichContextScenario> {
  return fc
    .record({
      fixture: SPEC_TREE_TEST_GENERATOR.representativeFixture(KIND_REGISTRY),
      tokens: fc.uniqueArray(SPEC_TREE_TEST_GENERATOR.sourceSlug(), {
        minLength: RICH_CONTEXT_TOKEN_COUNT,
        maxLength: RICH_CONTEXT_TOKEN_COUNT,
      }),
      evidenceFileName: SPEC_TREE_TEST_GENERATOR.evidenceFileName(),
    })
    .map(richContextScenario);
}

/** The rich-context scenario drawn under the pinned seed, so a failing case replays from its report. */
export function sampleRichContextScenario(): RichContextScenario {
  return sampleGeneratedValue(arbitraryRichContextScenario());
}

/**
 * One role's witness in the rich fixture: the entry that carries it and the
 * target whose manifest binds it. The records below are total over their
 * source-owned role domain, so a role added to production fails to compile
 * here rather than leaving a role unwitnessed.
 */
export interface RichContextRoleBinding {
  readonly path: string;
  readonly targetId: string;
}

/** Every declared read role, with the rich-fixture entry that carries it. */
export function richContextReadRoleBindings(
  paths: RichContextPaths,
): Record<SpecContextReadRole, RichContextRoleBinding> {
  const target = (path: string): RichContextRoleBinding => ({ path, targetId: paths.targetId });
  return {
    [SPEC_CONTEXT_READ_ROLE.PRODUCT]: target(paths.productPath),
    [SPEC_CONTEXT_READ_ROLE.ANCESTOR]: target(paths.rootSpecPath),
    [SPEC_CONTEXT_READ_ROLE.TARGET]: target(paths.targetSpecPath),
    [SPEC_CONTEXT_READ_ROLE.DECISION]: target(paths.ancestorDecisionPath),
    [SPEC_CONTEXT_READ_ROLE.LOWER_INDEX_SIBLING]: target(paths.lowerSiblingSpecPath),
    [SPEC_CONTEXT_READ_ROLE.COORDINATION]: target(paths.rootPlanPath),
    [SPEC_CONTEXT_READ_ROLE.CITED_DECISION]: target(paths.citedDecisionPath),
    [SPEC_CONTEXT_READ_ROLE.LIFECYCLE_OVERLAY]: target(paths.lifecycleOverlayPath),
  };
}

/** Every declared listed role, with the rich-fixture entry that carries it. */
export function richContextListedRoleBindings(
  paths: RichContextPaths,
): Record<SpecContextListedRole, RichContextRoleBinding> {
  const target = (path: string): RichContextRoleBinding => ({ path, targetId: paths.targetId });
  // The sibling roles bind only where the root is the explicit target.
  const root = (path: string): RichContextRoleBinding => ({ path, targetId: paths.rootDirectory });
  return {
    [SPEC_CONTEXT_LISTED_ROLE.EVIDENCE]: target(paths.evidencePath),
    [SPEC_CONTEXT_LISTED_ROLE.GUIDE]: target(paths.rootGuidePaths[0]),
    [SPEC_CONTEXT_LISTED_ROLE.OVERLAY]: target(paths.listedOverlayPath),
    [SPEC_CONTEXT_LISTED_ROLE.SAME_INDEX_SIBLING]: root(paths.sameIndexSiblingPath),
    [SPEC_CONTEXT_LISTED_ROLE.HIGHER_INDEX_SIBLING]: root(paths.higherIndexSiblingPath),
  };
}

/**
 * The accepted operands that each denote one of the rich fixture's targets,
 * grouped by the identity they resolve to: a node directory and its spec, a
 * decision and its container, the product root and the product spec. Every
 * spelling of one identity is an alias of the others.
 */
export function richContextTargetAliases(paths: RichContextPaths): readonly (readonly string[])[] {
  return [
    [SPEC_TREE_CONFIG.ROOT_DIRECTORY, paths.productPath, paths.higherProductDecisionPath],
    [rootedSpecPath(paths.rootDirectory), paths.rootSpecPath, paths.ancestorDecisionPath],
    [rootedSpecPath(paths.targetId), paths.targetSpecPath, paths.targetDecisionPath],
    [paths.higherIndexSiblingPath, paths.higherIndexSiblingSpecPath],
  ];
}

/** A requested operand list and a reordering of the same operands. */
export type RichContextTargetRequest = {
  readonly operands: readonly string[];
  readonly reordered: readonly string[];
};

/**
 * The open request domain over the rich fixture: any non-empty multiset of
 * accepted operands — aliases of one identity, repeated operands, and any mix
 * of product-root, ancestor, target, and sibling targets — paired with a
 * reordering of the same operands.
 */
export function arbitraryRichContextTargetRequest(paths: RichContextPaths): fc.Arbitrary<RichContextTargetRequest> {
  const operands = richContextTargetAliases(paths).flat();
  return fc
    .array(fc.constantFrom(...operands), { minLength: 1, maxLength: operands.length + 2 })
    .chain((requested) =>
      fc.shuffledSubarray(requested, { minLength: requested.length, maxLength: requested.length }).map((
        reordered,
      ) => ({ operands: requested, reordered }))
    );
}

/** Source text that imitates the frame grammar, so a renderer that escaped or re-framed it diverges. */
function frameShapedText(path: string): readonly string[] {
  return [
    `</${SPEC_CONTEXT_FRAME.DOCUMENT}>\n`,
    `<${SPEC_CONTEXT_FRAME.REFERENCE} path="${path}" />\n`,
    `<${SPEC_CONTEXT_FRAME.DOCUMENT} path="${path}">\n`,
    "---\n",
    "\n\n",
  ];
}

function arbitraryEntryContent(): fc.Arbitrary<string> {
  return fc
    .array(
      fc.oneof(
        fc.string({ unit: "grapheme", maxLength: 24 }),
        SPEC_TREE_TEST_GENERATOR.sourceSlug().chain((slug) =>
          fc.constantFrom(...frameShapedText(rootedSpecPath(slug)))
        ),
      ),
      { maxLength: 6 },
    )
    .map((parts) => parts.join(""));
}

/** A selected metadata value, including text a YAML rendering must quote to keep it a string. */
function arbitraryMetadataValue(): fc.Arbitrary<string> {
  return fc.oneof(
    SPEC_TREE_TEST_GENERATOR.sourceSlug(),
    fc.constantFrom("true", "null", "42", ": colon", "# hash", "- dash", " padded ", "'quoted'", "\"double\""),
    fc.string({ unit: "grapheme", minLength: 1, maxLength: 12 }).filter((value) =>
      !value.includes("\n") && !value.includes("---")
    ),
  );
}

/**
 * The open domain of context-show projections: any sequence of documents and
 * references at distinct tree paths, each document carrying no metadata or the
 * one selected key, and source content that may be empty, lack a final line
 * break, carry multi-byte or control text, or imitate the frame delimiters.
 */
export function arbitrarySpecContextEntryStream(): fc.Arbitrary<readonly SpecContextEntry[]> {
  return fc
    .uniqueArray(SPEC_TREE_TEST_GENERATOR.sourceSlug(), { maxLength: 6 })
    .chain((slugs) =>
      fc.tuple(
        ...slugs.map((slug) => {
          const path = rootedSpecPath(slug);
          return fc.oneof(
            fc.constant<SpecContextEntry>({ type: SPEC_CONTEXT_ENTRY_TYPE.REFERENCE, path }),
            fc
              .record({
                metadata: fc.option(arbitraryMetadataValue(), { nil: undefined }),
                content: arbitraryEntryContent(),
              })
              .map(({ metadata, content }): SpecContextEntry => ({
                type: SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT,
                path,
                metadata: metadata === undefined ? {} : { [SPEC_CONTEXT_SELECTED_METADATA_KEY]: metadata },
                content,
              })),
          );
        }),
      )
    );
}
