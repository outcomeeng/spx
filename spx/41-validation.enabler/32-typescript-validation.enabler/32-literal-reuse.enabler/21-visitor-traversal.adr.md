# AST Visitor Traversal

## Purpose

This decision governs how the literal-reuse detector enumerates child AST nodes when walking a TypeScript source or test file. It applies to the core traversal function of the detector and to any global pre-pass within this subtree that reads TypeScript ASTs.

## Context

**Business impact:** Cross-file literal indexing is only as precise as the traversal that feeds it. Visiting non-child properties — `loc`, `range`, parent pointers, parser-private fields — produces phantom entries in the index, traps the walker in back-reference cycles, or crashes on nullable metadata. Either failure class degrades literal-reuse to noise and forces the stage to be disabled.

**Technical constraints:** The TypeScript parser emits ESTree-compatible AST nodes whose enumerable fields mix child nodes with metadata. The ESLint ecosystem maintains `eslint-visitor-keys` as the canonical mapping of node type to child-carrying field names; TypeScript-aware parsers extend this map at registration time with their additional node types. [21-typescript-conventions.adr.md](../21-typescript-conventions.adr.md) governs the conventions the detector enforces; [21-enforcement-tooling.adr.md](../32-ast-enforcement.enabler/21-enforcement-tooling.adr.md) governs the per-file enforcement path, leaving the cross-file pre-pass to this subtree.

## Decision

The detector enumerates child nodes by looking up the current node's type in an injected visitor-keys map whose default implementation composes `eslint-visitor-keys` core with the TypeScript parser's extended keys, and descends only into the fields that map returns.

## Rationale

The visitor-keys map is the single source of truth the parser emits for "what are the children of this node." Hand-rolled field whitelists drift as parsers add node types. `Object.keys`-driven enumeration visits every enumerable field — including `loc`, `range`, parent pointers, and parser-private metadata — which either pollutes the literal index or traps the walker in a cycle.

Accepting the map via dependency injection satisfies three concerns at once: the detector is exercised against a stub parser in unit tests, the extended keys from the TypeScript parser compose with the core map without bundler hacks, and alternative parsers (Babel, swc) remain reachable without a code change in the detector itself.

Alternatives considered:

- **Hand-rolled field whitelist per node type.** A `Record<NodeType, readonly FieldName[]>` inside the detector. Rejected because the whitelist duplicates what the parser already declares and rots every time the parser adds a node type. Compliance reduces to a text-diff exercise rather than a behavioral property.
- **`Object.keys`-driven enumeration with skip-set.** Walk every enumerable field, skip a hardcoded list of metadata names. Rejected because the skip-set depends on parser implementation details that change without API notice; a missing metadata field introduces phantom literals that are invisible without a second walker to diff against.
- **TypeScript-compiler API visitor (`ts.forEachChild`).** Uses the tsc AST, which differs from the ESTree AST that the rest of the validation subtree operates on. Rejected because the detector's findings must reference positions consistent with ESLint diagnostics in the same pipeline; node identity across the two ASTs is not one-to-one.

## Trade-offs accepted

| Trade-off                                                                                | Mitigation / reasoning                                                                                                                                   |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The visitor-keys map must stay in sync with the parser version                           | The composition is a pure function of the parser's public keys export; updating the parser updates the map atomically; no hand-maintained list drifts    |
| Nodes whose type is absent from the visitor-keys map contribute no literals to the index | Fail-closed behavior: a missing registration surfaces as a zero-literal walk, which property tests catch via a deterministic walk-count invariant        |
| The public detector API gains one parameter                                              | Dependency injection is already mandated by [21-typescript-conventions.adr.md](../21-typescript-conventions.adr.md); this is consistent with the pattern |

## Invariants

- For every AST node the walker receives, the set of fields descended into equals the set returned by `visitorKeys[node.type]`, or is empty if the entry is absent.
- Two detector runs over the same sources produce identical literal occurrence arrays regardless of the internal iteration order of fields, because field order derives from the keys map, not from the `Object.keys` ordering of the node.

## Compliance

### Recognized by

A single visitor function in the detector that accepts `(node, visitorKeys)` and descends by array lookup. No `Object.keys(node)`, no `for...in` loop, no hand-maintained field whitelist inside the detector.

### MUST

- The walker accept a visitor-keys map as a dependency-injected parameter typed as `Record<string, readonly string[]>` — enables `l1` unit tests to inject a stub map covering a miniature AST ([review])
- The default implementation compose `eslint-visitor-keys` core with the TypeScript parser's extended keys at a single construction site; the composition is exported for reuse by related pre-passes ([review])
- The walker short-circuit to a zero-child descent when the node type is absent from the visitor-keys map — fail-closed behavior surfaces parser or map drift as missing literals, detectable by property tests ([review])

### NEVER

- Enumerate AST node fields by `Object.keys(node)`, `for...in`, or any untyped reflection mechanism — visits parser metadata and breaks the literal-index invariants ([review])
- Maintain a hand-rolled node-type to field-name map inside the detector — duplicates what the parser declares and drifts silently ([review])
- Cast the node to `any` to reach into fields the type system hides — defeats the visitor-keys invariant at the type boundary ([review])
- `vi.mock()` or `jest.mock()` the visitor-keys import in tests — dependency injection of the map is the only sanctioned test-double mechanism ([review])
