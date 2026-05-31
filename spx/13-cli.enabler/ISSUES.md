# Open Issues

## Two patterns coexist for descriptor stderr warning writes

- Review: CI `spec-tree-review` on PR #90 — F-002 (standards, follow_up). [Comment](https://github.com/outcomeeng/spx/pull/90#issuecomment-4587847103).
- Evidence: Three CLI-interface descriptors emit an undecorated warning string to stderr with a trailing newline. `src/interfaces/cli/spec.ts:84-86` uses a named `writeWarning(warning)` helper that calls `console.error(warning)`. `src/interfaces/cli/config.ts:28` uses an inline `process.stderr.write(\` ${resolved.warning}\n\`)`. `src/interfaces/cli/session.ts:177` uses the same inline `process.stderr.write(\`${result.warning}\n\`)` shape. The output bytes are identical across all three, but the API and the encapsulation are not.
- Impact: A future author adding a fourth warning-emitting descriptor sees two patterns to choose from, with no documented preference. The split also blocks any future change to warning formatting (a prefix tag, a colorized stream, structured output for `--json`) from landing in one place — every site has to be edited independently.
- Resolution: Decide whether `console.error(warning)` (spec.ts model) or `process.stderr.write(\`${warning}\n\`)`(config.ts and session.ts model) is canonical for descriptor warning writes, then update the other sites and extract a shared helper into the CLI-interface layer. The shared helper home is`src/interfaces/cli/` since the operation is descriptor-scoped, not domain-scoped.
