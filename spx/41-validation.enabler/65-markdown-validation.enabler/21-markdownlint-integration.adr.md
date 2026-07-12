# Markdownlint Integration

Markdown validation uses markdownlint-cli2's programmatic Node API (`main()`) through a typed dependency seam, with configuration built in code and passed via `optionsOverride`, so no config files are written to validated directories; the custom rule `markdownlint-rule-relative-links` is supplied through the config object's `customRules`. The step in `src/validation/steps/markdown.ts` exports `validateMarkdown(options, deps)` — taking a `ValidateMarkdownOptions` that carries a `MarkdownValidationTarget[]` of directory or file targets plus an optional product root, and a `MarkdownValidationDeps` that carries the markdownlint entry point — and returns a result with a success flag and structured error objects. The step also exports the pure config builder `buildMarkdownlintConfig(directoryName)` and `getDefaultDirectories(productDir)`, which returns the `spx/` and `docs/` directories that exist under the product root. Markdown is registered as a `ValidationLanguageDescriptor` (`markdownValidationLanguage`) composed into the pipeline through the validation registry `src/validation/registry.ts`, ordered after the TypeScript language, so `spx validation all` dispatches it as a registry-composed stage and never by a hardcoded step index.

## Rationale

The programmatic API avoids subprocess overhead, eliminates discovering or locating a CLI binary, and yields structured error output without parsing stdout, while configuration built in code is versioned with the source, testable as a pure function, and produces no side effects in validated directories. ESLint's Node API has different orchestration ergonomics and remains subprocess-backed, whereas markdownlint-cli2's `main()` is designed for programmatic use. Because `main()` returns only an exit code, its logged output is captured via `logMessage`/`logError` callbacks and parsed into structured error objects, and the custom relative-links rule — which ships no TypeScript types — has its object shape verified by the config builder test.

Subprocess execution of the markdownlint-cli2 binary requires tool discovery, stdout parsing, and config-file management and is excluded. Writing `.markdownlint.jsonc` to validated directories produces side effects, risks git-status pollution, and requires cleanup, so `optionsOverride` owns configuration instead. An optional dependency with runtime discovery contradicts always-available validation with no skip path; a production dependency with a direct production binding satisfies that requirement.

## Verification

### Audit

- ALWAYS: use markdownlint-cli2's `main()` function with `optionsOverride` for configuration — no config files written to disk ([audit])
- ALWAYS: accept the markdownlint `main()` entry point through `MarkdownValidationDeps`, with the imported production function wired only as the default dependency — enables isolated orchestration verification without replacing modules ([audit])
- ALWAYS: export `buildMarkdownlintConfig()` as a pure function returning the config object — enables isolated `l1` testing of rule selection ([audit])
- ALWAYS: export `getDefaultDirectories(productDir)` returning the default directories that exist under the product root — enables `l1` testing of directory discovery against fixture directories ([audit])
- ALWAYS: return structured error objects with file, line, and detail fields — enables programmatic consumption by the pipeline ([audit])
- ALWAYS: register markdown as a `ValidationLanguageDescriptor` composed through the validation registry per `spx/19-language-registration.adr.md`, ordered after the TypeScript language — pipeline ordering derives from the registry, not a hardcoded step index ([audit])
- NEVER: write config files to validated directories — produces side effects that pollute git status ([audit])
- NEVER: use subprocess execution for markdownlint — the programmatic API is available and preferred ([audit])
- NEVER: use `discoverTool()` or skip validation when markdownlint is unavailable — it is a production dependency, always present ([audit])
- NEVER: use `vi.mock()` or `jest.mock()` to replace markdownlint orchestration — inject a controlled `runMarkdownlint` implementation through `MarkdownValidationDeps` ([audit])
