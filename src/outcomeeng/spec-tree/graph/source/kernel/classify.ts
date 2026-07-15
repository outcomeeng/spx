/**
 * Source artifact ownership classification: a pure function over declared
 * test evidence-link facts, normalized provider facts, and the source
 * artifact inventory. Ownership authority flows from spec-linked tests;
 * provider facts are evidence, never ownership authority.
 *
 * @module outcomeeng/spec-tree/graph/source/kernel/classify
 */

import type { NormalizedProviderFact } from "../normalize/identity";
import type { ProviderFactProvenance } from "../providers/descriptor";
import type { OwnershipEvidenceCategory, SourceOwnershipClassification } from "./classification";

/** A declared spec-linked test evidence fact injected from the spec/test graph boundary. */
export interface TestEvidenceLinkFact {
  readonly testPath: string;
}

/** The injected inputs ownership classification consumes; no other input exists. */
export interface SourceOwnershipInput {
  readonly sourceArtifacts: readonly string[];
  readonly evidenceLinks: readonly TestEvidenceLinkFact[];
  readonly facts: readonly NormalizedProviderFact[];
}

/** One source artifact's classification, the evidence category justifying it, and the justifying provenance. */
export interface SourceOwnershipRecord {
  readonly sourcePath: string;
  readonly classification: SourceOwnershipClassification;
  readonly evidence: OwnershipEvidenceCategory;
  readonly provenance: readonly ProviderFactProvenance[];
}

/**
 * Classifies every source artifact named by the inventory or a fact into one
 * ownership classification, justified by exactly one evidence category, with
 * the justifying facts' provenance retained on the record.
 */
export function classifySourceOwnership(_input: SourceOwnershipInput): readonly SourceOwnershipRecord[] {
  throw new Error("classifySourceOwnership is not implemented");
}
