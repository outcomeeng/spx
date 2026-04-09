# Tool-Based Validation

## Purpose

This decision governs the level at which validation specs reference concrete tools. It applies to every spec and decision under `41-validation.outcome/`.

## Context

**Business impact:** Users who run `spx validation all` see concrete tools execute: ESLint, tsc, madge, ruff, mypy, pyright, semgrep. The tree must be readable to someone who knows those tools by name. Abstracting over them as "the linter" or "the type checker" obscures the product's actual surface and forces readers to translate in both directions.

**Technical constraints:** Each validation step is a tool invocation with its own config file, failure modes, and output format. Tools are not interchangeable — ruff does not replace mypy, ESLint does not replace tsc. The validation pipeline is the composition of named tools, not a generic runner.

## Decision

Outcome nodes under `41-validation.outcome/` are tool-agnostic. Enabler nodes within language subtrees are 100% tool-based: each enabler names the exact tool it provides and specifies the tool's behavior directly.

## Rationale

The outcome level is where users articulate *why* validation matters — what it catches, what it proves, what hypothesis it validates. That level is about developer experience and trust, not about which binary produces the output. Multiple tools may satisfy the same outcome (ruff replaces flake8 + isort + pylint), so outcome specs must not name tools.

The enabler level is where validation assertions become executable. An enabler for "ruff" asserts what ruff does — its exit codes, its config file, its diagnostic format. Abstracting this into "the Python linter" adds indirection with zero benefit: there is exactly one tool per enabler, the enabler name says which one, and the assertions describe that tool's concrete behavior.

Alternatives considered:

- **Tool-agnostic enablers** — introduces a "linter interface" abstraction layer. Forces every enabler to describe generic linter behavior and every test to verify the abstraction rather than the tool. Pushes decisions about tool behavior out of the spec tree into code comments. Rejected because the spec tree is meant to be authoritative about what the product does; indirection breaks that.
- **Tool-specific outcomes** — makes outcomes like "ESLint validation outcome." Violates the outcome definition — outcomes describe user-facing value hypotheses, not tool invocations. Rejected because it conflates *what matters* with *how we check it*.

## Trade-offs accepted

| Trade-off                                                                 | Mitigation / reasoning                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Adding a new tool requires a new enabler node                             | Tool additions are infrequent and structural; the cost is proportional to the change |
| Replacing a tool (e.g., eslint → biome) requires a spec-tree refactor     | Tool replacement is a significant product change; the spec tree should reflect that  |
| Language subtrees duplicate the lint/type-check/ast-enforcement structure | Duplication is shallow and deliberate; each language's tools are independent         |

## Product invariants

- Each language's validation pipeline is composed of named tools whose behavior is specified at the enabler level.
- Users reading a language subtree see exactly which tools run, with no indirection through an abstraction layer.

## Compliance

### Recognized by

Every enabler directory within a language subtree under `41-validation.outcome/` names a specific tool in its spec opening. Every assertion in those enablers describes the named tool's concrete behavior.

### MUST

- Outcomes under `41-validation.outcome/` describe hypotheses without naming specific tools ([review])
- Each language validation enabler names its tool directly in the PROVIDES/SO THAT/CAN opening ([review])
- Each language registers for the stages of `spx validation` — lint, type-check, ast-enforcement, circular-deps — through a registration mechanism defined by a future ADR ([review])

### NEVER

- Introduce an abstraction layer (e.g., `LinterInterface`, `TypeChecker`) inside a language subtree that hides the concrete tool ([review])
- Name a specific tool in an outcome spec under `41-validation.outcome/` ([review])
