# Tool Adapters

PROVIDES per-tool ignore-flag adapters — one pure function per registered downstream tool that translates a `ScopeResult` into that tool's native argv form — plus a registry that exposes adapters by tool name
SO THAT every spx consumer invoking a downstream tool (eslint, tsc, madge, knip, markdownlint, pytest, vitest)
CAN obtain tool-specific ignore arguments from a resolved scope without reaching into filter layers, reimplementing flag syntax, or enumerating excluded paths

## Assertions

### Scenarios

- Given a consumer resolves a scope and requests adapter output for a registered tool, when the adapter runs, then the returned arguments reference exactly the paths in `ScopeResult.excluded` and reference those paths in the tool's native ignore-flag form ([test](tests/tool-adapters.scenario.l1.test.ts))
- Given a consumer requests adapter output for an unregistered tool name, when the registry lookup runs, then the lookup fails with an error naming the unregistered tool and the registered tool set ([test](tests/tool-adapters.scenario.l1.test.ts))

### Mappings

- Tool name to native ignore-flag form: each registered tool declares its translation from excluded path to argument sequence; the registry exposes the mapping by tool name ([test](tests/tool-adapters.mapping.l1.test.ts))

### Properties

- Adapters are pure over `(ScopeResult, AdapterConfig)`: the same resolved scope and the same adapter config produce equal argument arrays across invocations, regardless of which tool was adapted previously ([test](tests/tool-adapters.property.l1.test.ts))
- Adapter output references the excluded set exactly: every path named in the output corresponds to a path in `ScopeResult.excluded`, and every path in `ScopeResult.excluded` appears in the output in the tool's native form ([test](tests/tool-adapters.property.l1.test.ts))

### Compliance

- ALWAYS: each tool adapter lives in its own module and exports a single function typed `(scope: ScopeResult, config: AdapterConfig) => readonly string[]` ([review])
- ALWAYS: the adapter registry is composed through explicit static imports — one import statement per registered adapter, consistent with `../../16-config.enabler/21-descriptor-registration.adr.md` and `../../19-language-registration.adr.md` ([review])
- ALWAYS: adapter configuration — the set of registered tool names, each tool's ignore-flag token — comes from the file-inclusion descriptor ([review])
- NEVER: let an adapter consult a filter layer, read the ignore-source file, enumerate artifact-directory names, or match the hidden prefix — adapters read `ScopeResult` alone ([review])
- NEVER: hardcode a tool's ignore-flag token inside an adapter module — every token is descriptor-declared ([review])
- NEVER: introduce dynamic registry composition (filesystem scan, plugin loader) — registration is static at compile time ([review])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — tests exercise adapters against in-memory `ScopeResult` values ([review])
