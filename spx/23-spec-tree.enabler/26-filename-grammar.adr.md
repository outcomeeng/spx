# Filename Grammar Ownership

The spec-tree library is the single canonical source of the versioned Spec-Tree filename grammar, an ordered set of self-contained naming-schema versions from which a product's methodology declaration selects the members a read accepts, per [`spx/13-agent-capability-lifecycle.pdr.md`](spx/13-agent-capability-lifecycle.pdr.md). The library's recognizer classifies every filesystem name as valid, superseded, or invalid, retains the names a read does not recognize, and depends on no downstream consumer at build or run time. This refines [`21-kind-registry.adr.md`](spx/23-spec-tree.enabler/21-kind-registry.adr.md), extending its single-source rule from kind vocabulary to the whole filename grammar, and the forms each version accepts stand once, in the assertions of [`spx/23-spec-tree.enabler/29-filename-grammar.enabler/filename-grammar.md`](spx/23-spec-tree.enabler/29-filename-grammar.enabler/filename-grammar.md).

## Rationale

Recognizing Spec-Tree filenames is a parsing concern, and the spec-tree library is the code that parses them. The executable authority that enforces the grammar holds it; the methodology documentation that describes the grammar to readers is produced downstream by consuming spx, so the description cannot diverge from enforcement and spx depends on no downstream product at build or run time.

The "exactly once" principle of [`21-kind-registry.adr.md`](21-kind-registry.adr.md) reaches the whole grammar for the reason it governs kinds: a token declared in a consumer is drift invisible to the recognizer that owns the true vocabulary. Distinguishing superseded from invalid requires knowing prior grammars — a name is superseded exactly when an earlier schema version accepted it and no selected version does — so the grammar is an ordered set of complete schema versions rather than one current schema plus a hand-curated legacy list, which lets the recognizer report which version a name belongs to and derives the superseded set from real prior schemas. The recognizer already visits every name, so retaining the read's residual makes the invalid set the complement of recognition, with no second traversal and no separate scanner.

A name only a later grammar accepts is invalid rather than superseded, because supersession names a form a product has left and a product has not left a form it has not reached. Each name classifies by its own grammar with no containment check across the two, so a mixed tree is a valid state of a migration.

Rejected: treating the newest version as canonical whatever the declaration says, which classifies every name of a 3.2 product as superseded. Rejected: accepting every grammar for every product, which lets a 4.0 product accrue 3.x forms with no migration declared.

Rejected: the methodology-documentation product owning the grammar while spx synchronizes from it — spx cannot read that product at run time, and a second source is the drift the single-source principle forbids. Rejected: one current schema plus an ad hoc legacy-pattern list — it collapses all history into one undifferentiated bucket and cannot report which version a name conformed to. Rejected: generating the registry by codegen — [`21-kind-registry.adr.md`](21-kind-registry.adr.md) forbids it, and `as const` with `keyof typeof` provides typed vocabulary at compile time with no build step.

## Invariants

- Every Spec-Tree filename grammar token — kind and product suffixes, evidence modes, execution levels, language tails, the runner token, segment and order separators, the order pattern, coordination-note names, and eval-lane names — is declared exactly once in the spec-tree library's `as const` registry surface.
- A read classifies the complete set of filesystem names beneath the tree: every name is exactly one of valid, superseded, or invalid, and invalid is the complement of the union of valid and superseded.
- The union of the selected versions' accepted sets defines valid; the union of the accepted sets of the versions ordered before the declared target's, less the valid set, defines superseded.
- The selected versions are a function of the methodology declaration alone.
- A name's classification is a function of the selected versions, the declared target, and the name with its enclosing path alone — independent of process environment, traversal order, and file contents.

## Verification

### Audit

- ALWAYS: every Spec-Tree filename grammar token is declared once in the spec-tree library `as const` registry surface and consumed through the library surface ([audit])
- ALWAYS: the grammar is an ordered set of self-contained naming-schema versions, each carrying its accepted filename forms, from which the product's methodology declaration selects the members a read accepts ([audit])
- ALWAYS: the recognizer accepts the naming-schema versions, the selection the methodology declaration derives, and a filesystem record as parameters and returns a classification of valid, superseded with its version, or invalid — so the classification is verified by injecting schema-version fixtures, with no mocking ([audit])
- ALWAYS: the reader retains every name the recognizer classifies as neither valid nor superseded and exposes that residual as the invalid set through the spec-tree snapshot ([audit])
- ALWAYS: grammar emission accepts the output format as a parameter and renders through the shared multi-format reporter ([audit])
- ALWAYS: the naming-schema versions are owned by the spec-tree library and exposed through its surface; downstream products obtain them by invoking spx ([audit])
- ALWAYS: recognizer and grammar tests inject schema-version fixtures constructed as local `as const` objects passed as parameters ([audit])
- NEVER: declare a Spec-Tree filename grammar token outside the spec-tree library registry surface ([audit])
- NEVER: determine a name's classification from the selected versions alone — supersession requires consulting the versions ordered before the declared target's ([audit])
- NEVER: recognition or a read checks containment between a node of one selected grammar and a node of the other ([audit])
- NEVER: read the methodology-documentation product, or any artifact outside the product tree, to recognize or classify a filename ([audit])
- NEVER: produce the grammar registry by codegen, build step, or runtime scanning — the grammar is hand-authored `as const` per [`21-kind-registry.adr.md`](21-kind-registry.adr.md) ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any mocking mechanism for the recognizer or grammar — tests inject explicit schema-version fixtures and real filesystem records ([audit])
- NEVER: re-implement multi-format rendering for grammar emission instead of the shared reporter ([audit])
