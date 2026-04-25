# Audit

PROVIDES the `spx audit` command family — lifecycle management for audit verdict artifacts produced by the `typescript:auditing-typescript-tests` skill: verifying their internal consistency and reporting defects by stage
SO THAT CI pipelines, agents, and developers running `spx audit verify <file>`
CAN confirm that a recorded test-evidence verdict is structurally and semantically coherent before acting on it

## Assertions

### Scenarios

- Given `spx audit verify <file>` is run with a valid audit verdict XML, when all four verification stages pass, then the command exits 0 and prints `APPROVED` or `REJECT` to stdout ([test](tests/audit.scenario.l1.test.ts))
- Given `spx audit verify <file>` is run with a defective audit verdict XML, when one or more stages fail, then the command exits 1 and prints each defect to stdout preceded by its stage name ([test](tests/audit.scenario.l1.test.ts))

### Compliance

- NEVER: write audit verdict files to the spec tree — verdict artifacts are stored in `.spx/nodes/{encoded-node-path}/` per ADR `15-audit-directory` ([review](15-audit-directory.adr.md))
- ALWAYS: resolve `.spx/nodes/` relative to the main repository root, not the worktree root ([review](../15-worktree-resolution.pdr.md))
