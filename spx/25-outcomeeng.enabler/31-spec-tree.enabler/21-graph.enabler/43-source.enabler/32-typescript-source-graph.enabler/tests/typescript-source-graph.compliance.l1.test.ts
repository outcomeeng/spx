import { describe, expect, it } from "vitest";

import {
  PROVIDER_FACT_KIND,
  SOURCE_GRAPH_LANGUAGE,
  SOURCE_GRAPH_PROVIDER_REGISTRY,
  TYPESCRIPT_COVERAGE_PROVIDER,
  TYPESCRIPT_COVERAGE_PROVIDER_ID,
  TYPESCRIPT_MODULE_GRAPH_PROVIDER,
  TYPESCRIPT_MODULE_GRAPH_PROVIDER_ID,
} from "@/outcomeeng/spec-tree/graph/source";
import { arbitraryTypescriptProviderScenarioPair } from "@testing/generators/outcomeeng/typescript-source-graph";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("typescript source graph provider compliance", () => {
  it("reaches both typescript descriptors through the provider registry's explicit imports", () => {
    expect(SOURCE_GRAPH_PROVIDER_REGISTRY).toContain(TYPESCRIPT_COVERAGE_PROVIDER);
    expect(SOURCE_GRAPH_PROVIDER_REGISTRY).toContain(TYPESCRIPT_MODULE_GRAPH_PROVIDER);
  });

  it("emits only facts carrying a registered kind and provenance naming typescript and the emitting tool", () => {
    assertProperty(
      arbitraryTypescriptProviderScenarioPair(),
      (pair) => {
        for (const fact of TYPESCRIPT_COVERAGE_PROVIDER.collectFacts(pair.coverage.input)) {
          expect(Object.values(PROVIDER_FACT_KIND)).toContain(fact.kind);
          expect(fact.provenance.language).toBe(SOURCE_GRAPH_LANGUAGE.TYPESCRIPT);
          expect(fact.provenance.provider).toBe(TYPESCRIPT_COVERAGE_PROVIDER_ID);
        }
        for (const fact of TYPESCRIPT_MODULE_GRAPH_PROVIDER.collectFacts(pair.moduleGraph.input)) {
          expect(Object.values(PROVIDER_FACT_KIND)).toContain(fact.kind);
          expect(fact.provenance.language).toBe(SOURCE_GRAPH_LANGUAGE.TYPESCRIPT);
          expect(fact.provenance.provider).toBe(TYPESCRIPT_MODULE_GRAPH_PROVIDER_ID);
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("derives facts deterministically and only from data present in the supplied payload", () => {
    assertProperty(
      arbitraryTypescriptProviderScenarioPair(),
      (pair) => {
        expect(TYPESCRIPT_COVERAGE_PROVIDER.collectFacts(pair.coverage.input)).toStrictEqual(
          TYPESCRIPT_COVERAGE_PROVIDER.collectFacts(pair.coverage.input),
        );
        expect(TYPESCRIPT_MODULE_GRAPH_PROVIDER.collectFacts(pair.moduleGraph.input)).toStrictEqual(
          TYPESCRIPT_MODULE_GRAPH_PROVIDER.collectFacts(pair.moduleGraph.input),
        );

        const coveragePaths = new Set(
          pair.coverage.input.entries.flatMap((entry) => [entry.testPath, ...entry.coveredSourcePaths]),
        );
        for (const fact of TYPESCRIPT_COVERAGE_PROVIDER.collectFacts(pair.coverage.input)) {
          expect(coveragePaths).toContain(fact.testPath);
          expect(coveragePaths).toContain(fact.sourcePath);
        }

        const graphPaths = new Set([
          ...pair.moduleGraph.input.testEntryPaths,
          ...pair.moduleGraph.input.edges.flatMap((edge) => [edge.importerPath, edge.importedPath]),
        ]);
        for (const fact of TYPESCRIPT_MODULE_GRAPH_PROVIDER.collectFacts(pair.moduleGraph.input)) {
          expect(graphPaths).toContain(fact.testPath);
          expect(graphPaths).toContain(fact.sourcePath);
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
