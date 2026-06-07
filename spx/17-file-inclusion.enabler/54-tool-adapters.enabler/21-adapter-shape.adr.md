# Adapter Shape and Registry Composition

Each per-tool ignore-flag adapter is a pure function in its own module, typed `(scope: ScopeResult, config: AdapterConfig) => readonly string[]`, that transforms a resolved scope's excluded set into the tool's native flag-and-path arguments using an injected flag token. The registry composes adapters through explicit static imports and exposes one entry point — `toToolArguments(scope: ScopeResult, toolName: string, config: ToolAdaptersConfig): readonly string[]` — that dispatches by tool name and throws on an unregistered name. Each tool's flag token arrives as injected config rather than a hardcoded literal, so adapters stay pure and `l1`-testable with in-memory values.

## Rationale

Typing each adapter `(scope, config) => readonly string[]` with `AdapterConfig = { readonly ignoreFlag: string }` keeps adapter logic uniform — every adapter transforms `scope.excluded` into flag-and-path pairs using `config.ignoreFlag` — so a new tool requires one new module and one new registry entry, with no change to existing adapters and no change to the registry function's logic. A typed `AdapterMap` makes a missing registry entry a compile error rather than a silent gap.

Passing `ToolAdaptersConfig` to `toToolArguments` as an explicit parameter rather than reading it from a global registry makes every call site independently testable with in-memory config — a test verifies adapter output with any flag token without loading the production config — and follows the same injection pattern as `resolveScope` receiving `ScopeResolverConfig`. Throwing on an unknown tool name converts a silent failure class — calling `toToolArguments` with a misspelled tool and receiving zero flags — into an immediate diagnostic whose message names both the unknown tool and the registered set. The static-import registry pattern follows `spx/19-language-registration.adr.md`: each adapter is imported by an explicit statement and the dispatch map is constructed from those imports, with filesystem scanning and dynamic `require` excluded. Flag tokens vary per tool (`--ignore-pattern` for eslint, `--exclude` for tsc) and are descriptor-declared, so adapters receive them as injected configuration and never carry them as literals.

Rejected: an adapter as a method on a class (a plain exported function is simpler to import, tree-shake, and test, with no abstraction benefit when each tool's logic is a single transform); `toToolArguments` reading config from the production registry internally (it would depend on the config-loading infrastructure, preventing `l1` testing without the full config pipeline); and returning an empty array for unknown tools instead of throwing (silent empty output is a harder failure mode than a thrown error, and consumers that need soft failure can wrap the call).

## Invariants

- Each registered tool name appears in the adapter map exactly once.
- `toToolArguments` for a registered tool with a non-empty `ScopeResult.excluded` produces a non-empty array.
- `toToolArguments` for a registered tool with an empty `ScopeResult.excluded` produces an empty array.

## Verification

### Audit

- ALWAYS: each adapter is exported from its own module as a pure function typed `(scope: ScopeResult, config: AdapterConfig) => readonly string[]` — one export per module, no class methods, no closures over module state ([audit])
- ALWAYS: `toToolArguments` receives `ToolAdaptersConfig` as an explicit parameter, with no registry or config reads internal to the function, enabling `l1` testing with in-memory config ([audit])
- ALWAYS: `toToolArguments` throws an `Error` naming both the unregistered tool and the registered tool set when `toolName` is not in the adapter map ([audit])
- ALWAYS: the adapter registry is built from explicit static imports per `spx/19-language-registration.adr.md` ([audit])
- NEVER: hardcode a tool's ignore-flag token inside an adapter module — every token comes from the caller-supplied `AdapterConfig.ignoreFlag` ([audit])
- NEVER: let an adapter read `ScopeResult.included`, consult a filter layer, invoke git plumbing, or compose its own scope — adapters transform `scope.excluded` alone ([audit])
- NEVER: perform filesystem I/O inside any adapter function — adapters are pure over their arguments ([audit])
- NEVER: use dynamic registry composition (filesystem scan, plugin loader, `require()` calls) — registration is explicit at compile time ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — tests exercise adapters against in-memory `ScopeResult` and `ToolAdaptersConfig` values ([audit])
