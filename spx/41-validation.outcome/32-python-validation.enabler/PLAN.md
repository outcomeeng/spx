# Plan

## Open: Stage registration mechanism

The PDR at `../11-tool-based-validation.pdr.md` requires each language to register for the stages of `spx validation` (lint, type-check, ast-enforcement, circular-deps). The registration mechanism itself is not yet specified.

An ADR governing stage registration is required before implementation of the Python pipeline can begin. It should answer:

- How does a language declare which stages it supports?
- How does `spx validation all` discover and sequence registered stages across languages?
- How are per-stage tool invocations configured (arguments, config file discovery, working directory)?

This PLAN.md persists until that ADR is authored and the registration mechanism is in place. Implementation of the Python enabler children (`32-lint.enabler/` for ruff, `32-type-check.enabler/` for mypy and pyright, `32-ast-enforcement.enabler/` for semgrep) cannot begin until registration is defined.
