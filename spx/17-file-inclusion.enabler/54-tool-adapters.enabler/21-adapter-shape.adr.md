# Adapter Shape and Registry Composition

## Purpose

This decision governs the shape of each per-tool ignore-flag adapter function, the config type that carries each tool's flag token, the static registry composition pattern, and the signature of the public entry point `toToolArguments`. It applies to every module in `54-tool-adapters.enabler/`.

## Context

**Business impact:** The parent ADR (`../15-scope-composition.adr.md`) establishes that tool adapters receive `ScopeResult` and produce that tool's ignore-flag arguments without consulting filter layers. The product ADR (`../../19-language-registration.adr.md`) establishes that registries are composed through explicit static imports. This decision names the concrete function signature, config injection pattern, and error contract that realize those constraints.

**Technical constraints:** spx is TypeScript ESM. Tool flag tokens vary per tool (e.g., `--ignore-pattern` for eslint, `--exclude` for tsc) and are declared in the file-inclusion config descriptor — adapters must receive tokens as injected configuration. The registry must fail loudly on unknown tool names so consumers learn of registration mismatches at the call site rather than through silent empty output.

## Decision

Each adapter is exported from its own module as a pure function typed `(scope: ScopeResult, config: AdapterConfig) => readonly string[]`, where `AdapterConfig = { readonly ignoreFlag: string }`. The registry exposes `toToolArguments(scope: ScopeResult, toolName: string, config: ToolAdaptersConfig): readonly string[]`, composes adapters through explicit static imports, and passes each tool's `AdapterConfig` from the caller-supplied `ToolAdaptersConfig`. An unknown `toolName` causes `toToolArguments` to throw with a message naming the requested tool and the registered tool set.

## Rationale

Typing each adapter as `(scope, config) → readonly string[]` with `AdapterConfig = { readonly ignoreFlag: string }` keeps adapter logic uniform: every adapter transforms `scope.excluded` into flag-and-path pairs using `config.ignoreFlag`. New tools require one new module and one new registry entry — no changes to existing adapters, no changes to the registry function's logic.

Passing `ToolAdaptersConfig` to `toToolArguments` as an explicit parameter rather than reading it from a global registry makes every call site independently testable with in-memory config: a test verifies adapter output with any flag token without loading the production config. This follows the same injection pattern as `resolveScope` receiving `ScopeResolverConfig` explicitly.

Throwing on unknown tool name converts a silent failure class — calling `toToolArguments` with a misspelled tool and receiving zero flags — into an immediate diagnostic. The error message names both the unknown tool and the registered set.

The static-import registry pattern follows `../../19-language-registration.adr.md`: each adapter is imported by an explicit statement and the dispatch map is constructed from those imports. Filesystem scanning and dynamic require are excluded.

Alternatives considered:

- **Adapter as method on a class.** Rejected because a plain exported function is simpler to import, tree-shake, and test; no abstraction benefit when each tool's logic is a single transform.
- **`toToolArguments` reads config from the production registry internally.** Rejected because it makes `toToolArguments` dependent on the config loading infrastructure, preventing `l1` testing without the full config pipeline.
- **Return empty array for unknown tools instead of throwing.** Rejected because silent empty output is a harder failure mode than a thrown error; consumers that need soft failure can wrap the call.

## Trade-offs accepted

| Trade-off                                                              | Mitigation / reasoning                                                                                      |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Adding a new tool requires a new module file plus one registry entry   | The entry is one import and one map assignment; a typed `AdapterMap` makes missing entries a compile error  |
| Callers must supply `ToolAdaptersConfig` separately from `ScopeResult` | Config construction happens once at the callsite; callers already hold the loaded file-inclusion descriptor |
| `toToolArguments` throws on unknown tools rather than returning empty  | Callers that need soft failure can catch; silent zeros are the harder debugging scenario                    |

## Invariants

- Each registered tool name appears in the adapter map exactly once
- `toToolArguments` for a registered tool with a non-empty `ScopeResult.excluded` produces a non-empty array
- `toToolArguments` for a registered tool with an empty `ScopeResult.excluded` produces an empty array

## Compliance

### Recognized by

Every adapter module under `src/lib/file-inclusion/adapters/` exports exactly one function typed `(scope: ScopeResult, config: AdapterConfig) => readonly string[]`. The registry at `src/lib/file-inclusion/adapters/index.ts` imports each adapter through an explicit import statement and exposes `toToolArguments`. Tests pass `ScopeResult` and `ToolAdaptersConfig` in-memory without loading the production config.

### MUST

- Each adapter is exported from its own module as a pure function typed `(scope: ScopeResult, config: AdapterConfig) => readonly string[]` — one export per module, no class methods, no closures over module state ([review])
- `toToolArguments` receives `ToolAdaptersConfig` as an explicit parameter — no registry or config reads internal to the function — enables `l1` testing with in-memory config ([review])
- `toToolArguments` throws an `Error` naming both the unregistered tool and the registered tool set when `toolName` is not in the adapter map ([review])
- The adapter registry is built from explicit static imports per `../../19-language-registration.adr.md` ([review])

### NEVER

- Hardcode a tool's ignore-flag token inside an adapter module — flag tokens come from the caller-supplied `AdapterConfig.ignoreFlag` ([review])
- Let an adapter read `ScopeResult.included`, consult filter layers, read the ignore-source file, or enumerate artifact-directory names — adapters transform `scope.excluded` alone ([review])
- Perform filesystem I/O inside any adapter function — adapters are pure over their arguments ([review])
- Use dynamic registry composition (filesystem scan, plugin loader, `require()` calls) — registration is explicit at compile time ([review])
- Use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — tests exercise adapters against in-memory `ScopeResult` and `ToolAdaptersConfig` values ([review])
