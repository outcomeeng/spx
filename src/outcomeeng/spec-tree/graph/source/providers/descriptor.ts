/**
 * Provider descriptor contract for the source graph: the registered language
 * vocabulary, the provider fact kinds, the raw fact shape providers emit, and
 * the typed descriptor a language provider exports to join the registry.
 *
 * Raw facts are untrusted data — their fields are plain strings that
 * normalization validates and narrows into typed provenance and identities.
 *
 * @module outcomeeng/spec-tree/graph/source/providers/descriptor
 */

/** Languages whose source facts participate in the ownership classification vocabulary. */
export const SOURCE_GRAPH_LANGUAGE = {
  TYPESCRIPT: "typescript",
  PYTHON: "python",
  RUST: "rust",
} as const;

export type SourceGraphLanguage = (typeof SOURCE_GRAPH_LANGUAGE)[keyof typeof SOURCE_GRAPH_LANGUAGE];

/** Kinds of implementation-source facts a provider emits. */
export const PROVIDER_FACT_KIND = {
  COVERAGE: "coverage",
  REACHABILITY: "reachability",
} as const;

export type ProviderFactKind = (typeof PROVIDER_FACT_KIND)[keyof typeof PROVIDER_FACT_KIND];

/** Provenance of a normalized fact: the registered language and the emitting provider. */
export interface ProviderFactProvenance {
  readonly language: SourceGraphLanguage;
  readonly provider: string;
}

/**
 * A fact as a provider emits it. Fields are untrusted strings; only facts
 * attributable to a registered language, a registered fact kind, and a named
 * provider pass normalization — the shape a direct implementation-source
 * parse would produce carries no such attribution and binds nothing.
 */
export interface RawProviderFact {
  readonly kind: string;
  readonly testPath: string;
  readonly sourcePath: string;
  readonly provenance: {
    readonly language: string;
    readonly provider: string;
  };
}

/**
 * Typed descriptor a language provider exports; the registry reaches it
 * through an explicit import statement. Fact collection is a pure
 * transformation of provider-typed established-tool output supplied as a
 * parameter — tool invocation, artifact discovery, and file reading are host
 * concerns outside the source-graph path.
 */
export interface SourceGraphProviderDescriptor<Input> {
  readonly language: SourceGraphLanguage;
  readonly provider: string;
  // Method syntax (bivariant parameters) keeps every concrete descriptor
  // assignable to the registry's uniform element type while staying invokable.
  collectFacts(input: Input): readonly RawProviderFact[];
}
