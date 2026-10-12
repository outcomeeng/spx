/**
 * Observation helpers for the spec-tree source evidence: ordered-name and evidence-path
 * construction and projections of snapshots into comparable signatures. The helpers return
 * observations and names; every predicate lives in the linked test.
 *
 * @module harnesses/spec-tree/spec-tree-source
 */

import {
  getKindDefinition,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_FILE,
  type SpecTreeEvidenceSourceEntry,
  type SpecTreeNodeKind,
  type SpecTreeProjectedNode,
  type SpecTreeProjection,
  type SpecTreeSourceEntry,
} from "@/lib/spec-tree";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";

export type NodeSignature = {
  readonly kind: string;
  readonly order: number;
  readonly slug: string;
  readonly childCount: number;
};

export type DecisionSignature = {
  readonly kind: string;
  readonly order: number;
  readonly slug: string;
};

export type NodeDirectoryEntry = {
  readonly kind: SpecTreeNodeKind;
  readonly order: number;
  readonly slug: string;
};

export function evidenceFilePath(rootDirectory: string, evidenceFile: string): string {
  return [SPEC_TREE_CONFIG.ROOT_DIRECTORY, rootDirectory, SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME, evidenceFile].join(
    "/",
  );
}

export function evidenceFileName(tail: readonly string[]): string {
  return [
    sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug()),
    sampleEvidenceMode(),
    sampleEvidenceLevel(),
    ...tail,
  ].join(SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR);
}

export function ambiguousEvidenceFileName(): string {
  const mode = sampleEvidenceMode();
  const level = sampleEvidenceLevel();
  return [
    sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug()),
    mode,
    level,
    sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug()),
    mode,
    level,
    ...SPEC_TREE_EVIDENCE_FILE.TAILS.TYPESCRIPT,
  ].join(SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR);
}

function sampleEvidenceMode(): string {
  return SPEC_TREE_EVIDENCE_FILE.MODES[0];
}

function sampleEvidenceLevel(): string {
  return SPEC_TREE_EVIDENCE_FILE.LEVELS[0];
}

export function nodeSignatures(projection: SpecTreeProjection): readonly NodeSignature[] {
  return flattenNodes(projection.nodes).map((node) => ({
    kind: node.kind,
    order: node.order,
    slug: node.slug,
    childCount: node.children.length,
  }));
}

export function flattenNodes(nodes: readonly SpecTreeProjectedNode[]): readonly SpecTreeProjectedNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
}

export function decisionSignatures(projection: SpecTreeProjection): readonly DecisionSignature[] {
  return projection.decisions.map((decision) => ({
    kind: decision.kind,
    order: decision.order,
    slug: decision.slug,
  }));
}

export function isEvidenceEntry(entry: SpecTreeSourceEntry): entry is SpecTreeEvidenceSourceEntry {
  return entry.type === SPEC_TREE_ENTRY_TYPE.EVIDENCE;
}

export function nodeDirectoryName(node: NodeDirectoryEntry): string {
  return `${node.order}-${node.slug}${getKindDefinition(node.kind).suffix}`;
}
