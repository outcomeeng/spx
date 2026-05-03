# Literal Reuse

PROVIDES the cross-file literal-reuse detection stage — a global pre-pass over every TypeScript source and test file that emits two classes of problem (src↔test reuse and test↔test duplication) for literal values carrying domain meaning, with operator-controlled scoping, suppression, and output formats
SO THAT `spx validation all` running against a TypeScript project
CAN enforce the source/test boundary import rules and the no-test-owned-semantic-constant rules from [`21-typescript-conventions.adr.md`](../21-typescript-conventions.adr.md) — patterns that per-file ESLint rules cannot detect because they require indexing literals across the full codebase

## Assertions

### Compliance

- ALWAYS: the stage participates in `spx validation all` — `allCommand` imports and invokes `literalCommand`, which returns a non-zero exit code when problems exist after value-allowlist suppression, path filtering, and kind selection ([review])
