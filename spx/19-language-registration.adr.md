# Language Registration

Each language declares its quality-gate participation — its detection function, the validation stages it contributes, and (for testing) its test-runner invocation — through a typed descriptor exported from one module per concern, `src/validation/languages/{language}.ts` for validation and `src/test/languages/{language}.ts` for testing, and a central registry reaches every descriptor through an explicit import statement and exposes the enumeration to orchestration. This governs every language participating under `spx/41-validation.enabler/` and `spx/41-test.enabler/`.

## Rationale

Descriptor-based registration separates what a language does from how orchestration composes it: adding a language means one descriptor module per concern plus one registry entry, with no change to orchestration logic, command handlers, or detection plumbing, and typed descriptors let the compiler enforce the required shape. Dynamic filesystem discovery is rejected because it hides the registration contract behind runtime scanning, breaks under bundlers that do not preserve directory structure, and fails silently when a descriptor omits fields; an orchestrator-owned dispatch table is rejected because adding a language would touch orchestration code, breaking the boundary between language implementation and pipeline composition; stage-level `enabled` predicates are rejected because they leak language membership into every stage and force orchestration to ask "is language X present?" at each stage rather than iterating over registered languages.

## Invariants

- Adding a new language touches exactly one descriptor module per concern it participates in, plus one registry entry per concern. No other files change.
- Orchestration code iterates over registered languages and their stages; it does not reference any specific language by name.

## Verification

### Audit

- ALWAYS: each language declares its quality-gate participation through a typed descriptor exported from `src/validation/languages/{language}.ts` (validation) or `src/test/languages/{language}.ts` (testing) ([audit])
- ALWAYS: the central registry imports each descriptor via an explicit import statement ([audit])
- ALWAYS: orchestration code references languages only through the registry's enumeration ([audit])
- NEVER: hardcode language-specific dispatch in orchestration code (`allCommand`, `testCommand`, pipeline composition) — orchestration iterates over the registry ([audit])
- NEVER: introduce dynamic filesystem scanning for descriptor discovery — registration is explicit at compile time ([audit])
- NEVER: reference a specific language by name in orchestration code paths — all access goes through the registry ([audit])
