# Kind Registry Architecture

## Purpose

This decision governs the shape and location of the spec-tree kind registry in `src/spec/config.ts`. The enabler's assertions specify observable behavior; this ADR specifies the code shape that makes those assertions true and explains the "why" behind a flat `as const` object keyed by kind name.

## Context

**Business impact:** Every module that touches the spec tree — parsing, walking, authoring, pruning, validation, testing, session handoff — needs to know which kinds exist, what category each belongs to, and which suffix identifies it on disk. A single source of truth reduces the adding-a-kind operation to one edit and eliminates the class of bugs where a consumer's hardcoded list drifts from the true vocabulary. A duplicated source forces every consumer to track changes; a generated source introduces a build step that complicates editor feedback.

**Technical constraints:** spx is TypeScript ESM, no runtime reflection, no codegen. `as const` object literals produce precise key- and value-typed types at compile time via `keyof typeof` and `typeof X[K]` inference. Consumers import from a single module; editors follow types across imports without a build step. The registry module depends on `src/config/` for the `ConfigDescriptor<T>` type (via the spec-tree descriptor) and on nothing else in production code.

## Decision

`src/spec/config.ts` declares `KIND_REGISTRY` — a flat object literal with `as const` where each key is a kind name (`enabler`, `outcome`, `adr`, `pdr`, and any additional kind) and each value is an object carrying at minimum `{ category: "node" | "decision", suffix: string }`. Types are inferred: `Kind = keyof typeof KIND_REGISTRY`, `KindDefinition<K extends Kind> = typeof KIND_REGISTRY[K]`, `NodeKind = { [K in Kind]: KIND_REGISTRY[K]["category"] extends "node" ? K : never }[Kind]`, and similarly for `DecisionKind`. Derived sub-registries (`NODE_KINDS`, `DECISION_KINDS`, `NODE_SUFFIXES`, `DECISION_SUFFIXES`) are computed at module scope by filtering and projecting `KIND_REGISTRY` — no separate declarations. The same module exports the spec-tree `ConfigDescriptor<SpecTreeConfig>` — its `defaults` field carries the full list of registered kind names; its `validate` field rejects yaml sections referring to kind names not in the registry.

## Rationale

Flat `as const` registry keyed by kind name satisfies the "exactly once" principle literally — the string `"enabler"` appears in the codebase as the object key and nowhere else. Types follow: `keyof typeof KIND_REGISTRY` produces the union at compile time without a second declaration. A consumer that switches on `kind` gets exhaustive-check diagnostics automatically; a typo in a literal is flagged where it appears.

The pattern — a single `as const` declaration that drives derived constants through type inference — carries its own justification: one declaration at the source, derived views at the call sites, no parallel arrays to drift out of sync. Consumers of the spec-tree vocabulary follow that shape.

A `category` field on each entry lets a single registry represent both nodes and decisions while keeping their type sets separable. `NodeKind` and `DecisionKind` are computed at the type level by mapped-type filtering — no parallel array declarations to drift out of sync. Adding a new category (something other than node or decision) is a one-line change to the category union and a new entry in the registry; no existing code reorganization is required.

Alternatives considered:

- **Separate top-level `NODE_KIND_REGISTRY` and `DECISION_KIND_REGISTRY` objects.** Rejected because the category distinction is a data property, not a declaration boundary. Splitting the registry doubles the declaration count without reducing complexity and forces every consumer that iterates "all kinds" to import and concatenate two sources.
- **Nested `CATEGORY_REGISTRY` with categories as outer keys and kinds as inner keys.** Rejected because the extra nesting buys flexibility no known requirement needs. Consumers that care about kinds care about the kinds; consumers that care about categories filter by the category field. Two levels of indirection add cognitive cost without clear benefit.
- **Runtime-only strings with no compile-time types.** Rejected because losing `keyof typeof` discards the entire value of TypeScript for this surface. Exhaustive-switch checks, type-safe consumer APIs, and editor autocomplete all depend on types.
- **Build-time codegen from yaml config.** Rejected because the kind vocabulary is a product-level decision, not a deployment-level decision. Projects do not invent their own kinds; they opt into the set the harness ships with (or a constrained override via config). A build step is overhead for functionality the type system already provides.
- **Type union declared separately alongside a runtime array.** Rejected because that duplicates the string — each kind appears in both the union type and the runtime array. The duplication is exactly what the "exactly once" principle forbids.

## Trade-offs accepted

| Trade-off                                                                           | Mitigation / reasoning                                                                                                               |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Adding a kind requires a code change (one line in the registry object)              | A deployment-time opt-in via yaml is still supported; the kind set itself is a product-level decision                                |
| Filtering the registry by category happens at every consumer call site              | Type inference makes the filter trivial (one line); the alternative is parallel registries that drift                                |
| The registry module is imported by every spec-tree-touching module                  | The module is tiny (one object + derived types); import cost is negligible; the alternative is duplicated vocabulary in every module |
| Categories ("node", "decision") are declared as a string union rather than computed | The set of categories is smaller and slower-moving than the set of kinds; a hand-maintained union is acceptable at this scale        |

## Invariants

- The registry is declared exactly once, as a single `as const` object literal in `src/spec/config.ts`
- `keyof typeof KIND_REGISTRY` is the sole source of the `Kind` type — no parallel union-type declaration
- Derived sub-registries (`NODE_KINDS`, `DECISION_KINDS`, `NODE_SUFFIXES`, `DECISION_SUFFIXES`) are computed by filter/projection over the registry — not declared separately
- The spec-tree `ConfigDescriptor` is co-located with the registry in the same module; consumers import both from one path

## Compliance

### Recognized by

`src/spec/config.ts` contains `KIND_REGISTRY`, the derived type aliases, the derived sub-registries, and the spec-tree `ConfigDescriptor`. No other module in the codebase contains a bare string literal matching a kind name (`"enabler"`, `"outcome"`, `"adr"`, `"pdr"`, or any other kind); no other module declares a type union over kind names; no other module declares a parallel array of suffixes.

### MUST

- `KIND_REGISTRY` is declared as a flat `as const` object literal with kind names as keys ([review])
- `Kind`, `NodeKind`, `DecisionKind`, and `KindDefinition<K>` types are computed via `keyof typeof` and mapped-type operators — never declared as literal unions ([review])
- Derived sub-registries (`NODE_KINDS`, `DECISION_KINDS`, `NODE_SUFFIXES`, `DECISION_SUFFIXES`) are computed at module scope from `KIND_REGISTRY` ([review])
- The spec-tree `ConfigDescriptor` lives in the same module as `KIND_REGISTRY` and references it directly — not a copy, not a re-declaration ([review])
- Tests for the registry and descriptor construct test-scoped registries as local `as const` objects and pass them explicitly — the production `KIND_REGISTRY` is not intercepted ([review])

### NEVER

- Declare a kind name as a bare string literal anywhere outside `src/spec/config.ts` ([review])
- Declare a type union over kind names — the union is inferred from the registry's keys ([review])
- Declare a parallel array, record, or constant of suffixes, categories, or kind metadata outside the derived sub-registries in the registry module ([review])
- Use codegen, build steps, or runtime scanning to produce kind metadata — `as const` + `keyof typeof` provides the same result at compile time with no build ([review])
- `vi.mock()`, `jest.mock()`, `memfs`, or any test-double mechanism against the registry module — tests use explicit test-scoped registries, not interception ([review])
