# Source Provider Boundary

The source graph consumes declared test-link facts from injected spec/test graph providers and implementation-source facts from language/provider outputs. SPX does not parse implementation source files to construct source graph edges.

## Rationale

Declared test links are product truth supplied through the spec/test graph boundary; implementation syntax is tool-owned. Language ecosystems already provide coverage, module, and import graph facts through established runners and analyzers. The source graph normalizes those facts so ownership and garbage-collection semantics remain stable across TypeScript, Python, Rust, and future language providers.

## Invariants

- Provider facts never override the assertion-to-test ownership declared in Spec Tree Markdown.
- A source artifact classification records both normalized artifact identity and provider provenance.
- Language providers are peers behind the source graph provider contract.
- Source graph operations receive declared test-link facts and implementation-source facts through injected providers.
- Tests exercise direct implementation-source parsing as a boundary violation without module interception.

## Verification

### Testing

- NEVER: source graph operations parse TypeScript, Python, Rust, or other implementation source files to infer ownership edges instead of consuming injected provider facts ([compliance])
- ALWAYS: source graph boundary tests exercise a direct implementation-source parser violation and reject it without module interception ([compliance])
- ALWAYS: source graph normalization preserves provider provenance for each source artifact fact ([compliance])

### Audit

- ALWAYS: source graph implementation consumes declared test-link facts and implementation-source facts through provider outputs ([audit])
- NEVER: source graph implementation parses TypeScript, Python, Rust, or other implementation source files to infer ownership edges ([audit])
- ALWAYS: provider facts retain language and provider provenance through normalization ([audit])
