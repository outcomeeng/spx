/**
 * Assertion harness for the source graph: classification mapping, evidence
 * justification, provenance retention, cross-language vocabulary, GC
 * derivation, and direct-parse rejection. The harness owns execution policy;
 * generated domains come from the source-graph generator; every expected
 * value derives from source-owned contracts.
 *
 * @module testing/harnesses/outcomeeng/source-graph
 */

import { expect } from "vitest";

import {
  CLASSIFICATION_EVIDENCE,
  classifySourceOwnership,
  deriveGarbageCollectionCandidates,
  normalizeProviderFact,
  SOURCE_GRAPH_LANGUAGE,
  SOURCE_OWNERSHIP_CLASSIFICATION,
  type SourceGraphLanguage,
  type SourceOwnershipClassification,
  type SourceOwnershipInput,
} from "@/outcomeeng/spec-tree/graph/source";
import {
  arbitraryAnyOwnershipScenario,
  arbitraryDirectParseFixture,
  arbitraryNormalizationScenario,
  arbitraryOwnershipGraphScenario,
  arbitraryOwnershipScenario,
  arbitraryUnresolvablePathFixture,
} from "@testing/generators/outcomeeng/source-graph";
import {
  assertProperty,
  PROPERTY_LEVEL,
  PROPERTY_SIZE,
  type PropertyClassification,
} from "@testing/harnesses/property/property";

const L1_STANDARD: PropertyClassification = { level: PROPERTY_LEVEL.L1 };
const L1_SMALL: PropertyClassification = { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL };

/** One ownership classification is produced by inputs generated to demand exactly it. */
export function assertOwnershipClassificationMappingFor(classification: SourceOwnershipClassification): void {
  assertProperty(
    arbitraryOwnershipScenario(classification),
    (scenario) => {
      const records = classifySourceOwnership(scenario.input);
      expect(records.map((record) => record.sourcePath)).toStrictEqual([scenario.sourcePath]);
      expect(records.at(0)?.classification).toBe(classification);
    },
    L1_SMALL,
  );
}

/** Every record's evidence category is exactly the one its classification is justified by. */
export function assertClassificationReportsJustifyingEvidence(): void {
  assertProperty(
    arbitraryAnyOwnershipScenario(),
    (scenario) => {
      const records = classifySourceOwnership(scenario.input);
      expect(records.at(0)?.evidence).toBe(CLASSIFICATION_EVIDENCE[scenario.expected]);
      for (const record of records) {
        expect(record.evidence).toBe(CLASSIFICATION_EVIDENCE[record.classification]);
      }
    },
    L1_STANDARD,
  );
}

/** Normalization preserves provenance and kind while binding canonical product-root-relative identities. */
export function assertProvenanceRetainedThroughNormalization(): void {
  assertProperty(
    arbitraryNormalizationScenario(),
    (scenario) => {
      const normalized = normalizeProviderFact(scenario.productDir, scenario.raw);
      expect(normalized.testPath).toBe(scenario.canonicalTestPath);
      expect(normalized.sourcePath).toBe(scenario.canonicalSourcePath);
      expect(normalized.kind).toBe(scenario.kind);
      expect(normalized.provenance).toStrictEqual(scenario.provenance);
    },
    L1_STANDARD,
  );
}

/** Fact-backed records retain the justifying facts' provenance; unowned records carry none. */
export function assertClassificationRetainsFactProvenance(): void {
  assertProperty(
    arbitraryAnyOwnershipScenario(),
    (scenario) => {
      const record = classifySourceOwnership(scenario.input).at(0);
      expect(record).toBeDefined();
      if (record?.classification === SOURCE_OWNERSHIP_CLASSIFICATION.UNOWNED) {
        expect(record.provenance).toStrictEqual([]);
        return;
      }
      expect(record?.provenance.length).toBeGreaterThan(0);
      for (const provenance of record?.provenance ?? []) {
        expect(scenario.input.facts.map((fact) => fact.provenance)).toContainEqual(provenance);
      }
    },
    L1_STANDARD,
  );
}

function withFactLanguage(input: SourceOwnershipInput, language: SourceGraphLanguage): SourceOwnershipInput {
  return {
    ...input,
    facts: input.facts.map((fact) => ({ ...fact, provenance: { ...fact.provenance, language } })),
  };
}

/** The same fact shapes classify identically whichever registered language emits them. */
export function assertSharedVocabularyAcrossLanguages(): void {
  assertProperty(
    arbitraryAnyOwnershipScenario(),
    (scenario) => {
      for (const language of Object.values(SOURCE_GRAPH_LANGUAGE)) {
        const record = classifySourceOwnership(withFactLanguage(scenario.input, language)).at(0);
        expect(record?.classification).toBe(scenario.expected);
        expect(record?.evidence).toBe(CLASSIFICATION_EVIDENCE[scenario.expected]);
      }
    },
    L1_STANDARD,
  );
}

/** GC candidates are exactly the unowned-classified records, whatever reachability facts exist. */
export function assertGcCandidatesDeriveFromClassification(): void {
  assertProperty(
    arbitraryOwnershipGraphScenario(),
    (scenario) => {
      const records = classifySourceOwnership(scenario.input);
      for (const record of records) {
        expect(record.classification).toBe(scenario.expectedBySourcePath.get(record.sourcePath));
      }
      const candidates = deriveGarbageCollectionCandidates(records);
      expect(candidates).toStrictEqual(
        records.filter((record) => record.classification === SOURCE_OWNERSHIP_CLASSIFICATION.UNOWNED),
      );
    },
    L1_STANDARD,
  );
}

/** A validly attributed fact whose path escapes or never enters the product directory is rejected. */
export function assertUnresolvableProviderFactPathRejected(): void {
  assertProperty(
    arbitraryUnresolvablePathFixture(),
    (fixture) => {
      expect(() => normalizeProviderFact(fixture.productDir, fixture.fact)).toThrowError(fixture.expectedDiagnostic);
    },
    L1_STANDARD,
  );
}

/** A fact shaped like a direct implementation-source parse is rejected with the exact diagnostic. */
export function assertDirectParseProviderFactRejected(): void {
  assertProperty(
    arbitraryDirectParseFixture(),
    (fixture) => {
      expect(() => normalizeProviderFact(fixture.productDir, fixture.fact)).toThrowError(fixture.expectedDiagnostic);
    },
    L1_STANDARD,
  );
}
