/**
 * Explicit-import registry of source graph provider descriptors. A language
 * provider joins by exporting a typed descriptor from its own module and
 * adding one import statement here, so the provider set is enumerable at
 * compile time and orchestration never names a language.
 *
 * @module outcomeeng/spec-tree/graph/source/providers/registry
 */

import type { SourceGraphLanguage } from "./descriptor";
import { TYPESCRIPT_COVERAGE_PROVIDER } from "./typescript/coverage";
import { TYPESCRIPT_MODULE_GRAPH_PROVIDER } from "./typescript/module-graph";

/**
 * Enumeration view of a registered provider: identity and provenance only.
 * Fact collection stays behind each provider's concrete typed export, so
 * registry-driven code cannot invoke a descriptor with another provider's
 * payload; the host that acquires tool output owns the typed pairing.
 */
export interface RegisteredSourceGraphProvider {
  readonly language: SourceGraphLanguage;
  readonly provider: string;
}

/** Every registered provider, reached through explicit import statements. */
export const SOURCE_GRAPH_PROVIDER_REGISTRY: readonly RegisteredSourceGraphProvider[] = [
  TYPESCRIPT_COVERAGE_PROVIDER,
  TYPESCRIPT_MODULE_GRAPH_PROVIDER,
];
