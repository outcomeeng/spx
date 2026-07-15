/**
 * Public surface of the Outcome Engineering source graph: ownership
 * classification vocabulary, provider descriptor contracts, identity and
 * provenance normalization, and garbage-collection candidate derivation.
 *
 * @module outcomeeng/spec-tree/graph/source
 */

export { deriveGarbageCollectionCandidates } from "./gc/candidates";
export {
  CLASSIFICATION_EVIDENCE,
  OWNERSHIP_EVIDENCE_CATEGORY,
  type OwnershipEvidenceCategory,
  SOURCE_OWNERSHIP_CLASSIFICATION,
  type SourceOwnershipClassification,
} from "./kernel/classification";
export {
  classifySourceOwnership,
  type SourceOwnershipInput,
  type SourceOwnershipRecord,
  type TestEvidenceLinkFact,
} from "./kernel/classify";
export {
  formatUnattributableProviderFactError,
  formatUnresolvableProviderFactPathError,
  type NormalizedProviderFact,
  normalizeProviderFact,
} from "./normalize/identity";
export { compareCodeUnits } from "./order";
export {
  PROVIDER_FACT_KIND,
  type ProviderFactKind,
  type ProviderFactProvenance,
  type RawProviderFact,
  SOURCE_GRAPH_LANGUAGE,
  type SourceGraphLanguage,
  type SourceGraphProviderDescriptor,
} from "./providers/descriptor";
export { SOURCE_GRAPH_PROVIDER_REGISTRY } from "./providers/registry";
export {
  TYPESCRIPT_COVERAGE_PROVIDER,
  TYPESCRIPT_COVERAGE_PROVIDER_ID,
  type TypescriptCoverageEntry,
  type TypescriptCoverageInput,
} from "./providers/typescript/coverage";
export {
  TYPESCRIPT_MODULE_GRAPH_PROVIDER,
  TYPESCRIPT_MODULE_GRAPH_PROVIDER_ID,
  type TypescriptModuleEdge,
  type TypescriptModuleGraphInput,
} from "./providers/typescript/module-graph";
