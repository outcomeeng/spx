import { describe, expect, it } from "vitest";

import {
  CLASSIFICATION_EVIDENCE,
  classifySourceOwnership,
  deriveGarbageCollectionCandidates,
  normalizeProviderFact,
  SOURCE_GRAPH_LANGUAGE,
  SOURCE_OWNERSHIP_CLASSIFICATION,
} from "@/outcomeeng/spec-tree/graph/source";
import {
  arbitraryAnyOwnershipScenario,
  arbitraryDirectParseFixture,
  arbitraryNormalizationScenario,
  arbitraryOwnershipGraphScenario,
  arbitraryUnresolvablePathFixture,
} from "@testing/generators/outcomeeng/source-graph";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("source graph compliance", () => {
  it("reports the evidence category justifying every classification", () => {
    assertProperty(
      arbitraryAnyOwnershipScenario(),
      (scenario) => {
        const records = classifySourceOwnership(scenario.input);
        expect(records.at(0)?.evidence).toBe(CLASSIFICATION_EVIDENCE[scenario.expected]);
        for (const record of records) {
          expect(record.evidence).toBe(CLASSIFICATION_EVIDENCE[record.classification]);
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("retains provenance alongside normalized artifact identity", () => {
    assertProperty(
      arbitraryNormalizationScenario(),
      (scenario) => {
        const normalized = normalizeProviderFact(scenario.productDir, scenario.raw);
        expect(normalized.testPath).toBe(scenario.canonicalTestPath);
        expect(normalized.sourcePath).toBe(scenario.canonicalSourcePath);
        expect(normalized.kind).toBe(scenario.kind);
        expect(normalized.provenance).toStrictEqual(scenario.provenance);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("retains the justifying facts' provenance on classification records", () => {
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
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("maps TypeScript, Python, and Rust facts into the same classification vocabulary", () => {
    assertProperty(
      arbitraryAnyOwnershipScenario(),
      (scenario) => {
        for (const language of Object.values(SOURCE_GRAPH_LANGUAGE)) {
          const record = classifySourceOwnership({
            ...scenario.input,
            facts: scenario.input.facts.map((fact) => ({
              ...fact,
              provenance: { ...fact.provenance, language },
            })),
          }).at(0);
          expect(record?.classification).toBe(scenario.expected);
          expect(record?.evidence).toBe(CLASSIFICATION_EVIDENCE[scenario.expected]);
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("derives garbage-collection candidates from classification alone", () => {
    assertProperty(
      arbitraryOwnershipGraphScenario(),
      (scenario) => {
        const records = classifySourceOwnership(scenario.input);
        for (const record of records) {
          expect(record.classification).toBe(scenario.expectedBySourcePath.get(record.sourcePath));
        }
        expect(deriveGarbageCollectionCandidates(records)).toStrictEqual(
          records.filter((record) => record.classification === SOURCE_OWNERSHIP_CLASSIFICATION.UNOWNED),
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects facts shaped like a direct implementation-source parse", () => {
    assertProperty(
      arbitraryDirectParseFixture(),
      (fixture) => {
        expect(() => normalizeProviderFact(fixture.productDir, fixture.fact)).toThrowError(fixture.expectedDiagnostic);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects fact paths that escape or never enter the product directory", () => {
    assertProperty(
      arbitraryUnresolvablePathFixture(),
      (fixture) => {
        expect(() => normalizeProviderFact(fixture.productDir, fixture.fact)).toThrowError(fixture.expectedDiagnostic);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
