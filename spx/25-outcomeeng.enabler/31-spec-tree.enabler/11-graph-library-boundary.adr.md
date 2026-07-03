# Graph Library Boundary

Outcome Engineering Spec Tree graph semantics consume backend-neutral tree facts, including declared evidence-link facts, from `spx/23-spec-tree.enabler` and do not own tree reading, filename grammar, entry recognition, source adapters, assembly, state derivation, or projection. The Outcome Engineering graph layer owns methodology relationships over artifacts after those tree facts exist.

## Rationale

`spx/23-spec-tree.enabler` is the reusable library for reading and projecting the Spec Tree. Outcome Engineering graph semantics describe how product truth, evidence, source artifacts, and change records relate as methodology primitives. Keeping those concerns separate prevents graph workflows from re-implementing tree grammar or snapshot construction while still giving garbage collection and impact analysis a durable methodology home.

## Invariants

- Graph operations receive tree facts, including declared evidence-link facts, through injected `spx/23-spec-tree.enabler` library outputs.
- Graph operations do not read Spec Tree files, parse Spec Tree filenames, or construct tree snapshots internally.
- Tests exercise boundary violations with injected fixture tree outputs and invalid direct-parser fixtures; they do not use module interception.

## Verification

### Testing

- NEVER: a graph operation reads Spec Tree files, parses Spec Tree filenames, or constructs tree snapshots internally instead of consuming injected tree facts ([compliance])
- ALWAYS: graph boundary tests exercise a direct-parser violation and reject it without using module interception ([compliance])

### Audit

- ALWAYS: graph implementation and tests consume `spx/23-spec-tree.enabler` outputs instead of parsing Spec Tree filename grammar, tree hierarchy, declared evidence links, or projection structures directly ([audit])
- NEVER: Outcome Engineering graph modules own source adapters, filename grammar, entry recognition, tree assembly, node-state derivation, or projection behavior already owned by `spx/23-spec-tree.enabler` ([audit])
