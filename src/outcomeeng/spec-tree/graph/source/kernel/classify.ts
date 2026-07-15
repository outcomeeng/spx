/**
 * Source artifact ownership classification: a pure function over declared
 * test evidence-link facts, normalized provider facts, and the source
 * artifact inventory. Ownership authority flows from spec-linked tests;
 * provider facts are evidence, never ownership authority.
 *
 * @module outcomeeng/spec-tree/graph/source/kernel/classify
 */

import type { NormalizedProviderFact } from "../normalize/identity";
import { PROVIDER_FACT_KIND, type ProviderFactProvenance } from "../providers/descriptor";
import {
  CLASSIFICATION_EVIDENCE,
  OWNERSHIP_EVIDENCE_CATEGORY,
  type OwnershipEvidenceCategory,
  SOURCE_OWNERSHIP_CLASSIFICATION,
  type SourceOwnershipClassification,
} from "./classification";

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

/** Fact-backed classifications in decreasing ownership strength; unowned is the no-evidence remainder. */
const CLASSIFICATION_PRECEDENCE: readonly SourceOwnershipClassification[] = [
  SOURCE_OWNERSHIP_CLASSIFICATION.OWNED_COVERED,
  SOURCE_OWNERSHIP_CLASSIFICATION.OWNED_REACHABLE,
  SOURCE_OWNERSHIP_CLASSIFICATION.COVERED_UNOWNED,
  SOURCE_OWNERSHIP_CLASSIFICATION.REACHABLE_UNOWNED,
];

function factEvidenceCategory(
  fact: NormalizedProviderFact,
  linkedTests: ReadonlySet<string>,
): OwnershipEvidenceCategory {
  if (linkedTests.has(fact.testPath)) {
    return fact.kind === PROVIDER_FACT_KIND.COVERAGE
      ? OWNERSHIP_EVIDENCE_CATEGORY.LINKED_TEST_COVERAGE
      : OWNERSHIP_EVIDENCE_CATEGORY.LINKED_TEST_REACHABILITY;
  }
  return fact.kind === PROVIDER_FACT_KIND.COVERAGE
    ? OWNERSHIP_EVIDENCE_CATEGORY.UNLINKED_COVERAGE
    : OWNERSHIP_EVIDENCE_CATEGORY.UNLINKED_REACHABILITY;
}

function uniqueProvenance(facts: readonly NormalizedProviderFact[]): readonly ProviderFactProvenance[] {
  const seen = new Set<string>();
  const provenance: ProviderFactProvenance[] = [];
  for (const fact of facts) {
    const key = `${fact.provenance.language}\u0000${fact.provenance.provider}`;
    if (seen.has(key)) continue;
    seen.add(key);
    provenance.push(fact.provenance);
  }
  return provenance;
}

function classifyArtifact(
  sourcePath: string,
  facts: readonly NormalizedProviderFact[],
  linkedTests: ReadonlySet<string>,
): SourceOwnershipRecord {
  for (const classification of CLASSIFICATION_PRECEDENCE) {
    const category = CLASSIFICATION_EVIDENCE[classification];
    const justifying = facts.filter((fact) => factEvidenceCategory(fact, linkedTests) === category);
    if (justifying.length > 0) {
      return { sourcePath, classification, evidence: category, provenance: uniqueProvenance(justifying) };
    }
  }
  return {
    sourcePath,
    classification: SOURCE_OWNERSHIP_CLASSIFICATION.UNOWNED,
    evidence: OWNERSHIP_EVIDENCE_CATEGORY.NO_OWNERSHIP_EVIDENCE,
    provenance: [],
  };
}

/**
 * Classifies every source artifact named by the inventory or a fact into one
 * ownership classification, justified by exactly one evidence category, with
 * the justifying facts' provenance retained on the record. Records are
 * ordered by source path so the projection is deterministic.
 */
export function classifySourceOwnership(input: SourceOwnershipInput): readonly SourceOwnershipRecord[] {
  const linkedTests = new Set(input.evidenceLinks.map((link) => link.testPath));
  const factsBySource = new Map<string, NormalizedProviderFact[]>();
  for (const fact of input.facts) {
    const facts = factsBySource.get(fact.sourcePath);
    if (facts === undefined) {
      factsBySource.set(fact.sourcePath, [fact]);
    } else {
      facts.push(fact);
    }
  }
  // Ordinal code-unit comparison keeps the record order a pure function of the
  // input strings; a locale-aware comparator would vary with the host ICU build.
  const sourcePaths = [...new Set([...input.sourceArtifacts, ...factsBySource.keys()])]
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return sourcePaths.map((sourcePath) =>
    classifyArtifact(sourcePath, factsBySource.get(sourcePath) ?? [], linkedTests)
  );
}
