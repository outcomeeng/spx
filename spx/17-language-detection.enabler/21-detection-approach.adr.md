# Detection Approach

## Purpose

This decision governs how spx determines which programming languages a project uses, enabling language-specific validation tools to run only where applicable.

## Context

**Business impact:** spx validates code across multilingual projects. Running language-specific tools (ESLint, mypy) in projects that don't use that language wastes time, produces errors, and — in the case of `npx` — prompts users to install irrelevant packages.

**Technical constraints:** Language ecosystems use well-known configuration files (`tsconfig.json`, `eslint.config.ts`, `pyproject.toml`) that reliably indicate language use. These files are stable markers — their presence is a necessary condition for the corresponding toolchain to function.

## Decision

Language detection uses configuration file presence as the sole indicator. Each language defines a set of marker files; if any marker file exists in the project root, the language is considered present.

## Rationale

Configuration file presence is both necessary and sufficient: a TypeScript project without `tsconfig.json` cannot compile, a Python project without `pyproject.toml` (or equivalent) has no dependency management. Alternative approaches — file extension scanning, `package.json` field inspection, shebang line parsing — are slower, less reliable, and detect languages that may be incidental (e.g., a lone `.py` script in a JS project).

Alternatives considered:

- **File extension scanning**: Finds files of a language but doesn't indicate the project actively uses that language's toolchain. A vendored `.ts` file in a Python project would falsely trigger ESLint.
- **`package.json` inspection**: TypeScript-specific, doesn't generalize to Python or other languages.

## Trade-offs accepted

| Trade-off                                                           | Mitigation / reasoning                                                                                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Projects without standard config files are not detected             | Such projects cannot use standard tooling anyway — no tsconfig means no tsc, no pyproject.toml means no managed Python dependencies |
| Monorepo sub-projects require running spx from the sub-project root | Monorepo support is a separate concern; detection operates on the current working directory                                         |

## Compliance

### Recognized by

Validation steps skip cleanly when the target project lacks marker files for that step's language.

### MUST

- Use configuration file presence, not file extension scanning, to determine language use ([review])
- Check marker files relative to the project root passed to the validation command ([review])

### NEVER

- Prompt the user to install tools for languages the project does not use ([review])
- Scan directory trees for file extensions as a detection mechanism — it is unreliable and slow ([review])
