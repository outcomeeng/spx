# Filename Grammar Ownership

The spec-tree library is the single canonical source of the versioned Spec-Tree filename grammar: every grammar token is declared exactly once in the library's `as const` registry surface, the grammar is an ordered set of self-contained naming-schema versions whose highest member is canonical and whose earlier members are superseded, and the library's recognizer classifies every filesystem name as valid, superseded, or invalid by retaining the names a read does not recognize — exposed through the shared multi-format reporter and depending on no downstream consumer at build or run time. This refines [`21-kind-registry.adr.md`](21-kind-registry.adr.md), extending its single-source and no-codegen rules from kind vocabulary to the whole filename grammar.

## Rationale

Recognizing Spec-Tree filenames is a parsing concern, and the spec-tree library is the code that parses them. The executable authority that enforces the grammar holds it; the methodology documentation that describes the grammar to readers is produced downstream by consuming spx, so the description cannot diverge from enforcement and spx depends on no downstream product at build or run time.

The "exactly once" principle of [`21-kind-registry.adr.md`](21-kind-registry.adr.md) reaches the whole grammar for the reason it governs kinds: a token declared in a consumer is drift invisible to the recognizer that owns the true vocabulary. Distinguishing superseded from invalid requires knowing prior grammars — a name is superseded exactly when an earlier schema version accepted it and the canonical one does not — so the grammar is an ordered set of complete schema versions rather than one current schema plus a hand-curated legacy list, which lets the recognizer report which version a name belongs to and derives the superseded set from real prior schemas. The recognizer already visits every name, so retaining the read's residual makes the invalid set the complement of recognition, with no second traversal and no separate scanner.

Rejected: the methodology-documentation product owning the grammar while spx synchronizes from it — spx cannot read that product at run time, and a second source is the drift the single-source principle forbids. Rejected: one current schema plus an ad hoc legacy-pattern list — it collapses all history into one undifferentiated bucket and cannot report which version a name conformed to. Rejected: generating the registry by codegen — [`21-kind-registry.adr.md`](21-kind-registry.adr.md) forbids it, and `as const` with `keyof typeof` provides typed vocabulary at compile time with no build step.

## Invariants

- Every Spec-Tree filename grammar token — kind and product suffixes, evidence modes, execution levels, language tails, the runner token, segment and order separators, the order pattern, coordination-note names, and eval-lane names — is declared exactly once in the spec-tree library's `as const` registry surface.
- A read classifies the complete set of filesystem names beneath the tree: every name is exactly one of valid, superseded, or invalid, and invalid is the complement of the union of valid and superseded.
- The canonical naming-schema version's accepted set defines valid; the union of earlier versions' accepted sets, less the canonical set, defines superseded.
- A name's classification is a function of the grammar schemas and the name alone — independent of process environment, traversal order, and file contents.

## Verification

### Audit

- ALWAYS: every Spec-Tree filename grammar token is declared once in the spec-tree library `as const` registry surface and consumed through the library surface ([audit])
- ALWAYS: the grammar is an ordered set of self-contained naming-schema versions, each carrying its accepted filename forms, the highest member canonical ([audit])
- ALWAYS: the recognizer accepts the grammar schema set and a filesystem record as parameters and returns a classification of valid, superseded with its version, or invalid — so the classification is verified by injecting schema-version fixtures, with no mocking ([audit])
- ALWAYS: the reader retains every name the recognizer classifies as neither valid nor superseded and exposes that residual as the invalid set through the spec-tree snapshot ([audit])
- ALWAYS: grammar emission accepts the output format as a parameter and renders through the shared multi-format reporter ([audit])
- ALWAYS: the dedicated naming-schema version is owned by the spec-tree library and exposed through its surface; downstream products obtain it by invoking spx ([audit])
- ALWAYS: recognizer and grammar tests inject schema-version fixtures constructed as local `as const` objects passed as parameters ([audit])
- NEVER: declare a Spec-Tree filename grammar token outside the spec-tree library registry surface ([audit])
- NEVER: determine a name's validity from the canonical schema alone — supersession requires consulting the prior schema versions ([audit])
- NEVER: read the methodology-documentation product, or any artifact outside the product tree, to recognize or classify a filename ([audit])
- NEVER: produce the grammar registry by codegen, build step, or runtime scanning — the grammar is hand-authored `as const` per [`21-kind-registry.adr.md`](21-kind-registry.adr.md) ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any mocking mechanism for the recognizer or grammar — tests inject explicit schema-version fixtures and real filesystem records ([audit])
- NEVER: re-implement multi-format rendering for grammar emission instead of the shared reporter ([audit])
