# Plan

## Implement Python validation

Python validation child enablers (`32-lint.enabler/`, `32-type-check.enabler/`, `32-ast-enforcement.enabler/`) specify tool invocations (ruff, mypy and pyright, semgrep). No implementation exists yet; the node is listed in `spx/EXCLUDE`.

Steps, per `../../19-language-registration.adr.md`:

1. Create descriptor module at `src/validation/languages/python.ts`
2. Register the descriptor in `src/validation/registry.ts`
3. Implement each stage invocation (`uv run ruff check`, `uv run mypy`, `uv run pyright`, `uv run semgrep --config .semgrep/`)
4. Write integration tests exercising each stage
5. Remove the node from `spx/EXCLUDE`
