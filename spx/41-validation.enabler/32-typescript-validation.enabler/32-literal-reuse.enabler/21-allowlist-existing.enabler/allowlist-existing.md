# Allowlist Existing

PROVIDES the bulk-silence adoption helper — records every current literal-reuse finding's value into the project's `literal.allowlist.include` in one operation, deduplicating against existing entries and preserving the original config file format
SO THAT projects carrying pre-existing literal-reuse duplications
CAN absorb the existing violations into configured allowlist entries without remediating every pre-existing duplication before the stage produces signal

## Assertions

### Scenarios

- Given a project with one or more current findings, when the user runs `spx validation literal --allowlist-existing`, then every distinct value currently flagged is appended to `literal.allowlist.include` in the project's `spx.config.*` file (creating the file or `literal` section if absent, deduplicating against existing entries, sorted alphabetically), and a subsequent `spx validation literal` run against the unchanged source reports zero findings ([test](tests/allowlist-existing.scenario.l1.test.ts))
- Given multiple `spx.config.*` files exist at the project root, when `--allowlist-existing` runs, then it returns the same ambiguity error as `resolveConfig` (naming every detected file) and writes nothing ([test](tests/allowlist-existing.scenario.l1.test.ts))

### Compliance

- ALWAYS: `--allowlist-existing` writes only to `literal.allowlist.include` — never to `presets`, `exclude`, or any other top-level section of `spx.config.*` ([test](tests/allowlist-existing.compliance.l1.test.ts))
- ALWAYS: `--allowlist-existing` is idempotent — running it twice in succession against unchanged source yields the same `include` set ([test](tests/allowlist-existing.compliance.l1.test.ts))
- NEVER: `--allowlist-existing` removes or reorders existing `include` entries — it only appends new values, deduplicating against the existing set ([test](tests/allowlist-existing.compliance.l1.test.ts))
