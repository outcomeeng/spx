# Tool-Based Validation

Aggregate enabler nodes under `spx/41-validation.enabler/` — those whose children are other enablers — stay tool-agnostic: the spec opening describes the category-level concern without naming a tool. Leaf enabler nodes — those that map to a single tool invocation — name the exact tool in the `PROVIDES` opening and specify that tool's concrete behavior directly.

## Rationale

The aggregate level is where readers articulate why a cluster of validation matters — what category of issues it catches, what user concern it addresses — so it is about developer experience and trust, not about which binary produces the output. Multiple tools may satisfy the same aggregate concern (ruff replaces flake8 + isort + pylint), so an aggregate spec that named a tool would falsely imply that tool is the only way to satisfy the concern. The leaf level is where validation assertions become executable: there is exactly one tool per leaf enabler, the enabler name says which one, and the assertions describe that tool's concrete behavior, so abstracting it into "the Python linter" would add indirection with zero benefit. Adding a tool is therefore a new leaf enabler and replacing one (eslint → biome) is a spec-tree refactor — both infrequent, structural changes proportional to the product change they represent — and the shallow duplication of the lint/type-check/ast-enforcement structure across language subtrees is deliberate because each language's tools are independent.

Tool-agnostic leaf enablers were rejected because they introduce a "linter interface" abstraction that forces every test to verify the abstraction rather than the tool and pushes tool-behavior decisions out of the spec tree into code comments. Tool-named aggregate enablers were rejected because they conflate what matters with how it is checked, violating the aggregate definition.

## Product properties

1. Each language's validation pipeline is composed of named tools whose behavior is specified at the leaf enabler level.
2. Users reading a language subtree see exactly which tools run, with no indirection through an abstraction layer.

## Verification

### Audit

- ALWAYS: aggregate enablers under `spx/41-validation.enabler/` describe category-level concerns without naming specific tools ([audit])
- ALWAYS: each leaf validation enabler names its tool directly in the spec opening ([audit])
- NEVER: introduce an abstraction layer (e.g., `LinterInterface`, `TypeChecker`) inside a language subtree that hides the concrete tool ([audit])
- NEVER: name a specific tool in an aggregate enabler spec under `spx/41-validation.enabler/` ([audit])
