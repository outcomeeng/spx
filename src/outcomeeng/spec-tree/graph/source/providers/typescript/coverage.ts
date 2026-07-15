/**
 * TypeScript coverage provider: maps test-attributed Vitest coverage output —
 * supplied as a typed payload, never read from disk — to coverage facts
 * carrying the executing test path, the covered source path, and this
 * provider's provenance.
 *
 * @module outcomeeng/spec-tree/graph/source/providers/typescript/coverage
 */

import {
  PROVIDER_FACT_KIND,
  type RawProviderFact,
  SOURCE_GRAPH_LANGUAGE,
  type SourceGraphProviderDescriptor,
} from "../descriptor";

/** Provider identity for test-attributed Vitest coverage output. */
export const TYPESCRIPT_COVERAGE_PROVIDER_ID = "vitest-coverage";

/** One executing test file and the source paths its run covered. */
export interface TypescriptCoverageEntry {
  readonly testPath: string;
  readonly coveredSourcePaths: readonly string[];
}

/** Test-attributed Vitest coverage output supplied by the host. */
export interface TypescriptCoverageInput {
  readonly entries: readonly TypescriptCoverageEntry[];
}

function collectTypescriptCoverageFacts(input: TypescriptCoverageInput): readonly RawProviderFact[] {
  void input;
  void PROVIDER_FACT_KIND;
  throw new Error("typescript coverage fact collection is not implemented");
}

/** The Vitest coverage descriptor the provider registry reaches through an explicit import. */
export const TYPESCRIPT_COVERAGE_PROVIDER: SourceGraphProviderDescriptor<TypescriptCoverageInput> = {
  language: SOURCE_GRAPH_LANGUAGE.TYPESCRIPT,
  provider: TYPESCRIPT_COVERAGE_PROVIDER_ID,
  collectFacts: collectTypescriptCoverageFacts,
};
