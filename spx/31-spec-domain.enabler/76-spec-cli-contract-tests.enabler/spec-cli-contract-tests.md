# Spec CLI Contract Tests

PROVIDES local process-level contract tests for `spx spec` command routing, flags, errors, and package-script invocation
SO THAT `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/` can stay focused on command behavior
CAN still prove the user-facing CLI entry point routes current spec-domain commands hermetically

## Assertions

### Scenarios

- Given the packaged executable runs in a temp product directory with a current `spx/` tree, when `spx spec status` is invoked through the process boundary, then it exits successfully and renders current spec-tree status output ([test](tests/spec-cli-contract.scenario.l2.test.ts))
- Given the packaged executable runs in a temp product directory whose current `spx/` tree carries no co-located tests, when `spx spec status --update` is invoked through the process boundary, then it exits successfully and renders each node's lifecycle state ([test](tests/spec-cli-contract.scenario.l2.test.ts))
- Given the packaged executable runs in a temp product directory with a current `spx/` tree, when `spx spec next` is invoked through the process boundary, then it exits successfully and renders the selected next node ([test](tests/spec-cli-contract.scenario.l2.test.ts))
- Given the packaged executable runs in a temp product directory with a current `spx/` tree, when `spx spec context <target> --json` is invoked through the process boundary with uniquely abbreviated node-directory segments and a trailing separator, then it exits successfully and renders deterministic context under the canonical target node path ([test](tests/context-target.scenario.l2.test.ts))
- Given an unsupported `spx spec status` format is passed through the process boundary, when the command runs, then it exits non-zero with a deterministic diagnostic ([test](tests/spec-cli-contract.scenario.l2.test.ts))
- Given a temp product directory contains `spx/EXCLUDE` and product configuration files, when `spx spec apply` is invoked through the process boundary, then the spec domain rejects the command without writing product configuration files ([test](tests/spec-cli-contract.scenario.l2.test.ts))

### Compliance

- ALWAYS: contract tests invoke the packaged executable without network access or remote services ([test](tests/spec-cli-contract.scenario.l2.test.ts))
- NEVER: contract tests share mutable state with the invoking agent outside the temp product directory ([test](tests/spec-cli-contract.scenario.l2.test.ts))
