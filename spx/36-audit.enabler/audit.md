# Audit

PROVIDES the `spx audit` command family — config-backed, branch-scoped lifecycle management for audit verdict artifacts produced by auditing skills: executing configured auditors, persisting audit state, verifying artifact consistency, and reporting defects by stage
SO THAT CI pipelines, agents, and developers running `spx audit`
CAN execute and inspect hermetically recorded audit evidence for the current branch before acting on it

## Assertions

### Scenarios

- Given `spx audit verify <file>` is run with a valid audit verdict XML, when all four verification stages pass, then the command exits 0 and prints `APPROVED` or `REJECT` to stdout ([test](tests/audit.scenario.l1.test.ts))
- Given `spx audit verify <file>` is run with a defective audit verdict XML, when one or more stages fail, then the command exits 1 and prints each defect to stdout preceded by its stage name ([test](tests/audit.scenario.l1.test.ts))
- Given `spx.config.{toml,json,yaml}` declares audit execution settings, when `spx audit` runs, then it resolves auditors, targets, and storage policy from the audit descriptor ([review])
- Given an audit run persists state, when the branch slug is known, then the state is written under `.spx/audit/{branch-slug}` at the main repository root ([review])

### Compliance

- NEVER: write audit verdict files to the spec tree — verdict artifacts are stored in `.spx/audit/{branch-slug}` per ADR `15-audit-directory` ([review](15-audit-directory.adr.md))
- ALWAYS: resolve `.spx/audit/` relative to the main repository root, not the worktree root ([review](../15-worktree-resolution.pdr.md))
- ALWAYS: audit config is a registered descriptor in the `spx/16-config.enabler/` config system; auditing does not parse raw `spx.config.*` content ([review](../16-config.enabler/21-descriptor-registration.adr.md))
