# Language Registration

## Purpose

This decision governs how language-specific quality gate participation — validation stages and test runners — is declared to the `spx` CLI. It applies to every enabler under `41-validation.enabler/` and `41-testing.enabler/`.

## Context

**Business impact:** `spx validation all` and `spx test` orchestrate language-specific tools. The orchestrator needs to know which languages are present in a project, which validation stages each language contributes, and how to invoke each language's test runner. Without a declared registration mechanism, orchestration code hardcodes language knowledge, making new language support a pervasive change.

**Technical constraints:** `spx` is a TypeScript CLI. Language-specific implementations live in `src/validation/languages/` and `src/testing/languages/`. Each language's detection, validation stages, and test runner are separate concerns that compose at runtime under the orchestrator.

## Decision

Each language declares its quality gate participation through a typed descriptor object exported from a single module per concern: `src/validation/languages/{language}.ts` for validation, `src/testing/languages/{language}.ts` for testing. The descriptor enumerates the language's detection function, the stages it supports, and (for testing) its test runner invocation. A central registry imports each descriptor via explicit import statement and exposes the enumeration to orchestration code.

## Rationale

Descriptor-based registration separates "what a language does" from "how orchestration composes it." Adding a new language requires one descriptor module per concern and one registry entry — no changes to orchestration logic, command handlers, or detection plumbing. Typed descriptors let the compiler enforce that each language's declaration has the required shape.

Alternatives considered:

- **Dynamic filesystem discovery** — scan `src/validation/languages/` at startup. Rejected because it obscures the registration contract behind runtime scanning, breaks with bundlers that don't preserve directory structure, and produces silent failures when a descriptor is missing fields.
- **Orchestrator-owned dispatch table** — hardcode language-to-stage mappings inside `allCommand` and `testCommand`. Rejected because adding a language touches orchestration code, breaking the boundary between language implementation and pipeline composition.
- **Stage-level opt-in via `enabled` predicates** — each stage stands alone with its own `enabled` predicate. Rejected because it leaks language membership into every stage and forces orchestration to ask "is language X present?" at every stage rather than iterating over registered languages.

## Trade-offs accepted

| Trade-off                                          | Mitigation / reasoning                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Descriptor modules require explicit registry entry | The entry is a single import; the registry's exhaustiveness check produces a compile-time error if one is missing |
| Each language opts into stages by inclusion        | Stages are optional fields in the descriptor; omitted stages produce a clean skip for that language               |
| Descriptor files duplicate structure across tools  | Each language's concerns are independent; sharing descriptor structure would force premature abstraction          |

## Invariants

- Adding a new language touches exactly one descriptor module per concern it participates in, plus one registry entry per concern. No other files change.
- Orchestration code iterates over registered languages and their stages; it does not reference any specific language by name.

## Compliance

### Recognized by

Every file under `src/validation/languages/` and `src/testing/languages/` exports exactly one typed descriptor for the language its filename names. The registries at `src/validation/registry.ts` and `src/testing/registry.ts` import each descriptor with an explicit import statement.

### MUST

- Each language declares its quality gate participation through a typed descriptor exported from `src/validation/languages/{language}.ts` (for validation) or `src/testing/languages/{language}.ts` (for testing) ([review])
- The central registry imports each descriptor via explicit import statement ([review])
- Orchestration code references languages only through the registry's enumeration ([review])

### NEVER

- Hardcode language-specific dispatch in orchestration code (`allCommand`, `testCommand`, pipeline composition) — orchestration iterates over the registry ([review])
- Introduce dynamic filesystem scanning for descriptor discovery — registration is explicit at compile time ([review])
- Reference a specific language by name in orchestration code paths — all access goes through the registry ([review])
