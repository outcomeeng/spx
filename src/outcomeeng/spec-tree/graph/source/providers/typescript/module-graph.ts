/**
 * TypeScript module-graph provider: maps module edges from established
 * TypeScript tooling — supplied as a typed payload, never computed from
 * source text here — to reachability facts by transitive closure from each
 * supplied test entry, carrying this provider's provenance.
 *
 * @module outcomeeng/spec-tree/graph/source/providers/typescript/module-graph
 */

import {
  PROVIDER_FACT_KIND,
  type RawProviderFact,
  SOURCE_GRAPH_LANGUAGE,
  type SourceGraphProviderDescriptor,
} from "../descriptor";

/** Provider identity for TypeScript module-graph output. */
export const TYPESCRIPT_MODULE_GRAPH_PROVIDER_ID = "typescript-module-graph";

/** One import relation from established TypeScript tooling. */
export interface TypescriptModuleEdge {
  readonly importerPath: string;
  readonly importedPath: string;
}

/** TypeScript module-graph output supplied by the host: test entry points and import edges. */
export interface TypescriptModuleGraphInput {
  readonly testEntryPaths: readonly string[];
  readonly edges: readonly TypescriptModuleEdge[];
}

function collectTypescriptModuleGraphFacts(input: TypescriptModuleGraphInput): readonly RawProviderFact[] {
  void input;
  void PROVIDER_FACT_KIND;
  throw new Error("typescript module-graph fact collection is not implemented");
}

/** The module-graph descriptor the provider registry reaches through an explicit import. */
export const TYPESCRIPT_MODULE_GRAPH_PROVIDER: SourceGraphProviderDescriptor<TypescriptModuleGraphInput> = {
  language: SOURCE_GRAPH_LANGUAGE.TYPESCRIPT,
  provider: TYPESCRIPT_MODULE_GRAPH_PROVIDER_ID,
  collectFacts: collectTypescriptModuleGraphFacts,
};
