# Detection Approach

Language detection uses configuration-file presence as the sole indicator: each language defines a set of marker files (`tsconfig.json` for TypeScript, `pyproject.toml` for Python, and their equivalents), and a language is considered present when any of its marker files exists at the product root — so language-specific tools (validation stages and test runners) run only where applicable.

## Rationale

Configuration-file presence is both necessary and sufficient — a TypeScript product without `tsconfig.json` cannot compile, a Python product without `pyproject.toml` (or equivalent) has no dependency management — and it avoids triggering toolchains on incidental files. File-extension scanning is rejected because it finds a language's files without indicating the product's toolchain uses that language, so a vendored `.ts` file in a Python product would falsely trigger ESLint, and it is slower and less reliable; `package.json` field inspection is rejected because it is TypeScript-specific and does not generalize to Python or other languages.

## Verification

### Audit

- ALWAYS: use configuration-file presence, not file-extension scanning, to determine language use ([audit])
- ALWAYS: check marker files relative to the product root passed to the calling command ([audit])
- NEVER: prompt the user to install tools for languages the product does not use ([audit])
- NEVER: scan directory trees for file extensions as a detection mechanism — it is unreliable and slow ([audit])
