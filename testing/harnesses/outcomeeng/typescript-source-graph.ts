/**
 * Assertion harness for the TypeScript source-graph provider: coverage and
 * reachability fact mappings, registry membership, provenance completeness,
 * and the supplied-payload-only boundary. The harness owns execution policy;
 * generated payloads come from the TypeScript source-graph generator; every
 * expected value derives from source-owned contracts.
 *
 * @module testing/harnesses/outcomeeng/typescript-source-graph
 */

import { expect } from "vitest";

import {
  compareCodeUnits,
  PROVIDER_FACT_KIND,
  type ProviderFactKind,
  type RawProviderFact,
  SOURCE_GRAPH_LANGUAGE,
  SOURCE_GRAPH_PROVIDER_REGISTRY,
  TYPESCRIPT_COVERAGE_PROVIDER,
  TYPESCRIPT_COVERAGE_PROVIDER_ID,
  TYPESCRIPT_MODULE_GRAPH_PROVIDER,
  TYPESCRIPT_MODULE_GRAPH_PROVIDER_ID,
  type TypescriptCoverageInput,
  type TypescriptModuleGraphInput,
} from "@/outcomeeng/spec-tree/graph/source";
import {
  arbitraryTypescriptCoverageScenario,
  arbitraryTypescriptModuleGraphScenario,
  arbitraryTypescriptProviderScenarioPair,
  type ProviderFactPair,
} from "@testing/generators/outcomeeng/typescript-source-graph";
import { assertProperty, PROPERTY_LEVEL, type PropertyClassification } from "@testing/harnesses/property/property";

const L1_STANDARD: PropertyClassification = { level: PROPERTY_LEVEL.L1 };

/** Expected facts for unique pairs: provider provenance applied, code-unit order per the provider-shape decision. */
function expectedFacts(
  kind: ProviderFactKind,
  provider: string,
  pairs: readonly ProviderFactPair[],
): readonly RawProviderFact[] {
  return [...pairs]
    .sort(
      ([leftTest, leftSource], [rightTest, rightSource]) =>
        compareCodeUnits(leftTest, rightTest) || compareCodeUnits(leftSource, rightSource),
    )
    .map(([testPath, sourcePath]) => ({
      kind,
      testPath,
      sourcePath,
      provenance: { language: SOURCE_GRAPH_LANGUAGE.TYPESCRIPT, provider },
    }));
}

/** Every test-attributed coverage entry maps to exactly one coverage fact with this provider's provenance. */
export function assertCoverageEntriesMapToCoverageFacts(): void {
  assertProperty(
    arbitraryTypescriptCoverageScenario(),
    (scenario) => {
      expect(TYPESCRIPT_COVERAGE_PROVIDER.collectFacts(scenario.input)).toStrictEqual(
        expectedFacts(PROVIDER_FACT_KIND.COVERAGE, TYPESCRIPT_COVERAGE_PROVIDER_ID, scenario.expectedPairs),
      );
    },
    L1_STANDARD,
  );
}

/** Every module reachable from a test entry maps to exactly one reachability fact with this provider's provenance. */
export function assertReachableModulesMapToReachabilityFacts(): void {
  assertProperty(
    arbitraryTypescriptModuleGraphScenario(),
    (scenario) => {
      expect(TYPESCRIPT_MODULE_GRAPH_PROVIDER.collectFacts(scenario.input)).toStrictEqual(
        expectedFacts(PROVIDER_FACT_KIND.REACHABILITY, TYPESCRIPT_MODULE_GRAPH_PROVIDER_ID, scenario.expectedPairs),
      );
    },
    L1_STANDARD,
  );
}

/** The provider registry reaches both TypeScript descriptors through its explicit imports. */
export function assertTypescriptProvidersRegistered(): void {
  expect(SOURCE_GRAPH_PROVIDER_REGISTRY).toContain(TYPESCRIPT_COVERAGE_PROVIDER);
  expect(SOURCE_GRAPH_PROVIDER_REGISTRY).toContain(TYPESCRIPT_MODULE_GRAPH_PROVIDER);
}

function collectBoth(
  coverage: TypescriptCoverageInput,
  moduleGraph: TypescriptModuleGraphInput,
): readonly (readonly [RawProviderFact, string])[] {
  return [
    ...TYPESCRIPT_COVERAGE_PROVIDER.collectFacts(coverage).map(
      (fact): readonly [RawProviderFact, string] => [fact, TYPESCRIPT_COVERAGE_PROVIDER_ID],
    ),
    ...TYPESCRIPT_MODULE_GRAPH_PROVIDER.collectFacts(moduleGraph).map(
      (fact): readonly [RawProviderFact, string] => [fact, TYPESCRIPT_MODULE_GRAPH_PROVIDER_ID],
    ),
  ];
}

/** Every fact either descriptor emits carries a registered kind and provenance naming typescript and its tool. */
export function assertTypescriptFactsCarryRegisteredKindAndProvenance(): void {
  assertProperty(
    arbitraryTypescriptProviderScenarioPair(),
    (pair) => {
      for (const [fact, provider] of collectBoth(pair.coverage.input, pair.moduleGraph.input)) {
        expect(Object.values(PROVIDER_FACT_KIND)).toContain(fact.kind);
        expect(fact.provenance.language).toBe(SOURCE_GRAPH_LANGUAGE.TYPESCRIPT);
        expect(fact.provenance.provider).toBe(provider);
      }
    },
    L1_STANDARD,
  );
}

function coveragePayloadPaths(input: TypescriptCoverageInput): ReadonlySet<string> {
  return new Set(input.entries.flatMap((entry) => [entry.testPath, ...entry.coveredSourcePaths]));
}

function moduleGraphPayloadPaths(input: TypescriptModuleGraphInput): ReadonlySet<string> {
  return new Set([
    ...input.testEntryPaths,
    ...input.edges.flatMap((edge) => [edge.importerPath, edge.importedPath]),
  ]);
}

/** Both descriptors are deterministic and every fact path names data present in the supplied payload. */
export function assertTypescriptFactsDeriveOnlyFromSuppliedPayload(): void {
  assertProperty(
    arbitraryTypescriptProviderScenarioPair(),
    (pair) => {
      expect(TYPESCRIPT_COVERAGE_PROVIDER.collectFacts(pair.coverage.input)).toStrictEqual(
        TYPESCRIPT_COVERAGE_PROVIDER.collectFacts(pair.coverage.input),
      );
      expect(TYPESCRIPT_MODULE_GRAPH_PROVIDER.collectFacts(pair.moduleGraph.input)).toStrictEqual(
        TYPESCRIPT_MODULE_GRAPH_PROVIDER.collectFacts(pair.moduleGraph.input),
      );
      const coveragePaths = coveragePayloadPaths(pair.coverage.input);
      for (const fact of TYPESCRIPT_COVERAGE_PROVIDER.collectFacts(pair.coverage.input)) {
        expect(coveragePaths).toContain(fact.testPath);
        expect(coveragePaths).toContain(fact.sourcePath);
      }
      const graphPaths = moduleGraphPayloadPaths(pair.moduleGraph.input);
      for (const fact of TYPESCRIPT_MODULE_GRAPH_PROVIDER.collectFacts(pair.moduleGraph.input)) {
        expect(graphPaths).toContain(fact.testPath);
        expect(graphPaths).toContain(fact.sourcePath);
      }
    },
    L1_STANDARD,
  );
}
