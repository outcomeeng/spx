/**
 * Explicit-import registry of source graph provider descriptors. A language
 * provider joins by exporting a typed descriptor from its own module and
 * adding one import statement here, so the provider set is enumerable at
 * compile time and orchestration never names a language.
 *
 * @module outcomeeng/spec-tree/graph/source/providers/registry
 */

import type { SourceGraphProviderDescriptor } from "./descriptor";

/** Every registered provider descriptor, reached through explicit import statements. */
export const SOURCE_GRAPH_PROVIDER_REGISTRY: readonly SourceGraphProviderDescriptor[] = [];
