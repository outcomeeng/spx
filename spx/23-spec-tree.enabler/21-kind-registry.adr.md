# Kind Registry Architecture

`src/lib/spec-tree/config.ts` declares `SPEC_TREE_CONFIG` as one `as const` semantic object owning the config section name, the tracked root directory name, product metadata, category values, and a flat `KINDS` registry keyed by kind name (`enabler`, `outcome`, `adr`, `pdr`, and any additional kind) where each entry carries `{ category, label, suffix, aliases }`. `KIND_REGISTRY`, `SPEC_TREE_KIND_CATEGORY`, and `SPEC_TREE_SECTION` are projections of `SPEC_TREE_CONFIG`, not separate sources; the types are inferred — `Kind = keyof typeof KIND_REGISTRY`, `KindDefinition<K extends Kind> = typeof KIND_REGISTRY[K]`, and `NodeKind` / `DecisionKind` by mapped-type filtering on each entry's `category` — and the derived sub-registries `NODE_KINDS`, `DECISION_KINDS`, `NODE_SUFFIXES`, `DECISION_SUFFIXES` are computed at module scope by filtering and projecting `KIND_REGISTRY`. The same module exports the spec-tree `ConfigDescriptor<SpecTreeConfig>`, whose `defaults` carry the full list of registered kind names and definitions and whose `validate` rejects config sections naming kinds or definitions absent from the registry. The module lives under `src/lib/` because spec-tree is a reusable library rather than a command domain, and it depends on `src/config/` for the `ConfigDescriptor<T>` type and nothing else in production code.

## Rationale

A flat `as const` registry keyed by kind name satisfies the "exactly once" principle literally — the string `"enabler"` appears as the object key and nowhere else — and `keyof typeof KIND_REGISTRY` produces the `Kind` union at compile time without a second declaration, so a consumer switching on `kind` gets exhaustive-check diagnostics and a typo is flagged where it appears. The `category` field lets one registry represent both nodes and decisions while keeping their type sets separable via mapped-type filtering, so there are no parallel arrays to drift; `label` supplies human-facing vocabulary and `aliases` records accepted alternate labels.

Rejected: separate `NODE_KIND_REGISTRY` / `DECISION_KIND_REGISTRY` objects (the category distinction is a data property, not a declaration boundary, and splitting forces every "all kinds" consumer to concatenate two sources); a nested `CATEGORY_REGISTRY` keyed by category (extra indirection no requirement needs); runtime-only strings with no compile-time types (discards `keyof typeof`, exhaustive checks, and autocomplete); build-time codegen from yaml (the kind vocabulary is a product-level decision the type system already expresses with no build step); and a type union declared separately alongside a runtime array (duplicates each kind string, exactly what "exactly once" forbids).

## Invariants

- The semantic registry is declared exactly once, as a single `as const` object literal in `src/lib/spec-tree/config.ts`.
- Kind labels, aliases, suffixes, and categories are properties of kind entries, never module-local formatter constants.
- `keyof typeof KIND_REGISTRY` is the sole source of the `Kind` type; no parallel union-type declaration exists.
- Derived sub-registries (`NODE_KINDS`, `DECISION_KINDS`, `NODE_SUFFIXES`, `DECISION_SUFFIXES`) are computed by filter/projection over the registry.
- The spec-tree `ConfigDescriptor` is co-located with the registry in the same module; consumers import both through the `src/lib/spec-tree` library surface.
- A config selecting a subset of registered kinds resolves to only the selected kinds; a config naming a kind or definition absent from the registry errors; absent any config selection, the section resolves to the full registry.

## Verification

### Audit

- ALWAYS: `SPEC_TREE_CONFIG` is declared as a single `as const` semantic object, and `KIND_REGISTRY` projects from `SPEC_TREE_CONFIG.KINDS` ([audit])
- ALWAYS: every kind entry carries category, label, suffix, and aliases ([audit])
- ALWAYS: `Kind`, `NodeKind`, `DecisionKind`, and `KindDefinition<K>` types are computed via `keyof typeof` and mapped-type operators ([audit])
- ALWAYS: derived sub-registries (`NODE_KINDS`, `DECISION_KINDS`, `NODE_SUFFIXES`, `DECISION_SUFFIXES`) are computed at module scope from `KIND_REGISTRY` ([audit])
- ALWAYS: the spec-tree `ConfigDescriptor` lives in the same module as `KIND_REGISTRY` and references the registry directly ([audit])
- ALWAYS: tests for the registry and descriptor construct test-scoped registries as local `as const` objects and pass them explicitly; they do not intercept the production `KIND_REGISTRY` ([audit])
- NEVER: declare a kind name as a bare string literal anywhere outside `src/lib/spec-tree/config.ts` ([audit])
- NEVER: declare display labels or aliases for registered kinds outside the semantic registry ([audit])
- NEVER: declare a type union over kind names; the union is inferred from the registry's keys ([audit])
- NEVER: declare a parallel array, record, or constant of suffixes, categories, or kind metadata outside the derived sub-registries in the registry module ([audit])
- NEVER: use codegen, build steps, or runtime scanning to produce kind metadata; `as const` + `keyof typeof` provides the same result at compile time with no build ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any test-double mechanism against the registry module; tests use explicit test-scoped registries, not interception ([audit])
