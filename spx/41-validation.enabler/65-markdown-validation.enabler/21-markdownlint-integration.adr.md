# Markdownlint Integration

## Purpose

This decision governs how markdown validation integrates with the spx validation pipeline. It covers tool selection, API usage, configuration management, and the boundary between the validation step and the CLI command layer.

## Context

**Business impact:** Broken links in `spx/` and `docs/` silently degrade spec tree integrity. Automated validation catches broken cross-references before they reach the repository.

**Technical constraints:** The spx validation pipeline uses a step/command/domain pattern (eslint.ts, lint.ts, validation domain). Each step exports a validation function; each command wraps a step with CLI option handling; the domain registers commands on Commander.js. markdownlint-cli2 provides a programmatic `main()` function that accepts configuration and returns an exit code. markdownlint-rule-relative-links provides a custom rule object for link validation.

## Decision

Use markdownlint-cli2's programmatic Node API (`main()` function) with configuration built in code and passed via `optionsOverride`. No config files are written to validated directories. The custom rule `markdownlint-rule-relative-links` is imported and passed via `customRules` in the config object.

## Rationale

The programmatic API avoids subprocess overhead, eliminates the need to discover/locate the CLI binary, and provides structured error output without parsing stdout. Configuration built in code is versioned with the source, testable as a pure function, and produces no side effects in validated directories.

Alternatives considered:

- **Subprocess execution (markdownlint-cli2 binary)**: Requires tool discovery, stdout parsing, and config file management. The existing ESLint step uses subprocess because ESLint's Node API has different ergonomics; markdownlint-cli2's `main()` is designed for programmatic use.
- **Writing .markdownlint.jsonc to validated directories**: Produces side effects, risks git status pollution, and requires cleanup. The programmatic API's `optionsOverride` eliminates this entirely.
- **Optional dependency with runtime discovery**: The spec mandates "always available, no skip path." A production dependency with direct import is simpler and satisfies this constraint.

## Trade-offs accepted

| Trade-off                                                                                       | Mitigation / reasoning                                                                                                                                    |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| markdownlint-cli2 result requires capturing logged output rather than returning structured data | The `main()` function returns only an exit code; logged output is captured via `logMessage`/`logError` callbacks and parsed into structured error objects |
| Custom rule is imported as a default export without types                                       | markdownlint-rule-relative-links has no TypeScript types; the rule object shape is verified by the config builder test                                    |
| Production dependency adds to bundle size                                                       | markdownlint-cli2 is a CLI tool dependency, not bundled into dist; it lives in node_modules and is invoked at validation time only                        |

## Compliance

### Recognized by

A `validateMarkdown()` function in `src/validation/steps/markdown.ts` that accepts directories and project root, returns structured results with success/errors, and produces no files in validated directories.

### MUST

- Use markdownlint-cli2's `main()` function with `optionsOverride` for configuration -- no config files written to disk ([review])
- Export `buildMarkdownlintConfig()` as a pure function returning the config object -- enables isolated Level 1 testing of rule selection ([review])
- Export `getDefaultDirectories()` as a pure function accepting a project root -- enables isolated Level 1 testing of directory discovery ([review])
- Return structured error objects with file, line, and detail fields -- enables programmatic consumption by the pipeline ([review])
- Register markdown as step 5 in `allCommand()` (after TypeScript) -- maintains pipeline ordering ([review])

### NEVER

- Write config files to validated directories -- produces side effects that pollute git status ([review])
- Use subprocess execution for markdownlint -- programmatic API is available and preferred ([review])
- Use `discoverTool()` or skip validation when markdownlint is unavailable -- it is a production dependency, always present ([review])
