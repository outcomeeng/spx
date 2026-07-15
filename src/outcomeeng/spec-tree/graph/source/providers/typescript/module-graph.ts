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
import { emitTypescriptFacts, type TypescriptFactPair } from "./emit";

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

function reachableFrom(entryPath: string, importsByImporter: ReadonlyMap<string, readonly string[]>): Set<string> {
  const visited = new Set<string>([entryPath]);
  const queue = [entryPath];
  for (let index = 0; index < queue.length; index += 1) {
    for (const imported of importsByImporter.get(queue[index]) ?? []) {
      if (visited.has(imported)) continue;
      visited.add(imported);
      queue.push(imported);
    }
  }
  visited.delete(entryPath);
  return visited;
}

function collectTypescriptModuleGraphFacts(input: TypescriptModuleGraphInput): readonly RawProviderFact[] {
  const importsByImporter = new Map<string, string[]>();
  for (const edge of input.edges) {
    const imported = importsByImporter.get(edge.importerPath);
    if (imported === undefined) {
      importsByImporter.set(edge.importerPath, [edge.importedPath]);
    } else {
      imported.push(edge.importedPath);
    }
  }
  return emitTypescriptFacts(
    PROVIDER_FACT_KIND.REACHABILITY,
    TYPESCRIPT_MODULE_GRAPH_PROVIDER_ID,
    input.testEntryPaths.flatMap((entryPath) =>
      [...reachableFrom(entryPath, importsByImporter)].map((sourcePath): TypescriptFactPair => [entryPath, sourcePath])
    ),
  );
}

/** The module-graph descriptor the provider registry reaches through an explicit import. */
export const TYPESCRIPT_MODULE_GRAPH_PROVIDER: SourceGraphProviderDescriptor<TypescriptModuleGraphInput> = {
  language: SOURCE_GRAPH_LANGUAGE.TYPESCRIPT,
  provider: TYPESCRIPT_MODULE_GRAPH_PROVIDER_ID,
  collectFacts: collectTypescriptModuleGraphFacts,
};
