# Open Issues

## Test-owned constant warning debt

`pnpm run validate` passed on May 12, 2026 and reported 37 warning-level `spx/no-test-owned-domain-constants` findings in this node. These warnings are existing test-quality debt and should be resolved with `spec-tree:testing`, `typescript:testing-typescript`, and `typescript:auditing-typescript-tests`.

Affected files:

- `spx/36-audit.enabler/21-audit-test-harness.enabler/tests/audit-test-harness.scenario.l1.test.ts`
- `spx/36-audit.enabler/32-verify.enabler/32-structural.enabler/tests/structural.scenario.l1.test.ts`
- `spx/36-audit.enabler/32-verify.enabler/43-semantic.enabler/tests/semantic.mapping.l1.test.ts`
- `spx/36-audit.enabler/32-verify.enabler/43-semantic.enabler/tests/semantic.scenario.l1.test.ts`
- `spx/36-audit.enabler/32-verify.enabler/54-paths.enabler/tests/paths.mapping.l1.test.ts`
- `spx/36-audit.enabler/32-verify.enabler/54-paths.enabler/tests/paths.scenario.l1.test.ts`
- `spx/36-audit.enabler/32-verify.enabler/tests/verify.scenario.l1.test.ts`
- `spx/36-audit.enabler/76-audit-cli.enabler/tests/audit-cli.scenario.l1.test.ts`
- `spx/36-audit.enabler/tests/audit.scenario.l1.test.ts`

Resolution: replace each test-owned semantic constant with source-owned constants, source-owned test-data APIs, or generated domain data, then remove the corresponding warning entry from the validation debt manifest.

## Domain-layer filesystem writes contradict the CLI composition purity law

[21-audit-module-structure.adr.md](21-audit-module-structure.adr.md) opens by claiming the audit domain follows the three-layer composition of [spx/14-cli-composition.adr.md](../14-cli-composition.adr.md) — "pure modules under `src/domains/audit/`" — yet in the same sentence assigns `src/domains/audit/run-state.ts` "run-directory creation, terminal `state.json` writing" (invariant: "Each exclusive-created audit run directory has exactly one terminal state writer"). `run-state.ts` violates this on two surfaces. It imports `node:fs/promises` (`mkdir`, `readdir`, `readFile`, `rename`, `writeFile`) at module scope to build `defaultFileSystem`, the implementation its public functions fall back to whenever no `fs` is injected — a direct filesystem-layer import inside a domain module. And those public functions orchestrate the I/O — run-directory creation, terminal `state.json` writing — even when an `AuditRunStateFileSystem` is injected, so injection makes the writes testable without lifting the orchestration out of the domain. Both surfaces contradict `spx/14-cli-composition.adr.md`: "NEVER: a module under `src/domains/{domain}/` … accesses the filesystem or process." The ADR is both internally inconsistent (claims purity, assigns I/O) and in violation of the governing product ADR.

The conforming pattern moves those public functions — and the `node:fs/promises` import they rely on — into a `src/commands/audit/` handler, leaving only the pure run-state transition logic — branch identity, slugging, run-id ordering, latest-terminal selection — in the domain. Injecting `AuditRunStateFileSystem`, as `run-state.ts` already does, keeps the writes testable but does not satisfy the rule on its own: the domain module still imports the filesystem layer and orchestrates the I/O, rather than returning a pure computation the way `computeReleaseData` returns release data from injected `GitDependencies`.

A parallel instance of the same contradiction — `readVerdictFile` performing a direct filesystem read in `src/domains/audit/reader.ts` — is tracked in [32-verify.enabler/21-verdict-reader.enabler/ISSUES.md](32-verify.enabler/21-verdict-reader.enabler/ISSUES.md). Both share the resolution path below; addressing one without the other leaves the contradiction half-resolved.

**Resolution (deferred, separate work).** Per the truth hierarchy, `spx/14-cli-composition.adr.md` is the product ADR governing every domain; `21-audit-module-structure.adr.md` is node-scoped and cannot override it, so its assignment of filesystem writes to `src/domains/audit/run-state.ts` is itself the rule in violation. The primary path is therefore to conform the audit ADR and code: move the public functions that perform run-directory creation and `state.json` writing — together with the `node:fs/promises` import they rely on — into a `src/commands/audit/` handler, leaving the pure run-state transition logic in the domain, so neither the filesystem import nor the I/O orchestration remains in the domain module. A secondary, higher-impact option — requiring its own justification, since it deliberately weakens the product law — is to amend `spx/14-cli-composition.adr.md` to sanction leaf I/O-utility modules as an explicit exception and have the audit ADRs cite it. The contradiction holds until one of these lands. Skills: `/spec-tree:contextualizing`, `/typescript:architecting-typescript`, `/typescript:auditing-typescript-architecture`.
