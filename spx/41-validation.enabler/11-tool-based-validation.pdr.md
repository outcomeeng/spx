# Tool-Based Validation

## Purpose

This decision governs the level at which validation specs reference concrete tools. It applies to every spec and decision under `41-validation.enabler/`.

## Context

**Business impact:** Users who run `spx validation all` see concrete tools execute: ESLint, tsc, madge, ruff, mypy, pyright, semgrep, markdownlint-cli2. The tree must be readable to someone who knows those tools by name. Abstracting over them as "the linter" or "the type checker" obscures the product's actual surface and forces readers to translate in both directions.

**Technical constraints:** Each validation step is a tool invocation with its own config file, failure modes, and output format. Tools are not interchangeable — ruff does not replace mypy, ESLint does not replace tsc. The validation pipeline is the composition of named tools, not a generic runner.

## Decision

Aggregate enabler nodes under `41-validation.enabler/` — those whose children are other enablers — are tool-agnostic: the spec opening describes the broader concern without naming specific tools. Leaf enabler nodes — those that map to a single tool invocation — name the exact tool in the PROVIDES opening and specify the tool's concrete behavior directly.

## Rationale

The aggregate level is where readers articulate *why* a cluster of validation matters — what category of issues it catches, what user concern it addresses. That level is about developer experience and trust, not about which binary produces the output. Multiple tools may satisfy the same aggregate concern (ruff replaces flake8 + isort + pylint), so aggregate specs must not name tools — naming a specific tool would falsely imply that tool is the only way to satisfy the concern.

The leaf level is where validation assertions become executable. An enabler for "ruff" asserts what ruff does — its exit codes, its config file, its diagnostic format. Abstracting this into "the Python linter" adds indirection with zero benefit: there is exactly one tool per leaf enabler, the enabler name says which one, and the assertions describe that tool's concrete behavior.

Alternatives considered:

- **Tool-agnostic leaf enablers** — introduces a "linter interface" abstraction layer. Forces every enabler to describe generic linter behavior and every test to verify the abstraction rather than the tool. Pushes decisions about tool behavior out of the spec tree into code comments. Rejected because the spec tree is meant to be authoritative about what the product does; indirection breaks that.
- **Tool-named aggregate enablers** — makes aggregates like "ruff validation enabler." Violates the aggregate definition — aggregates describe category-level concerns spanning multiple possible tool choices, not single tool invocations. Rejected because it conflates *what matters* with *how we check it*.

## Trade-offs accepted

| Trade-off                                                                 | Mitigation / reasoning                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Adding a new tool requires a new leaf enabler node                        | Tool additions are infrequent and structural; the cost is proportional to the change |
| Replacing a tool (e.g., eslint → biome) requires a spec-tree refactor     | Tool replacement is a significant product change; the spec tree should reflect that  |
| Language subtrees duplicate the lint/type-check/ast-enforcement structure | Duplication is shallow and deliberate; each language's tools are independent         |

## Product invariants

- Each language's validation pipeline is composed of named tools whose behavior is specified at the leaf enabler level.
- Users reading a language subtree see exactly which tools run, with no indirection through an abstraction layer.

## Compliance

### Recognized by

Every leaf enabler directory within a language subtree under `41-validation.enabler/` names a specific tool in its spec opening. Every assertion in those leaf enablers describes the named tool's concrete behavior.

### MUST

- Aggregate enablers under `41-validation.enabler/` describe category-level concerns without naming specific tools ([review])
- Each leaf validation enabler names its tool directly in the spec opening ([review])

### NEVER

- Introduce an abstraction layer (e.g., `LinterInterface`, `TypeChecker`) inside a language subtree that hides the concrete tool ([review])
- Name a specific tool in an aggregate enabler spec under `41-validation.enabler/` ([review])
