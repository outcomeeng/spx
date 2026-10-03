---
malleability: spec
---

# Spec CLI Contract Tests

PROVIDES local process-level contract tests for `spx spec` command routing, flags, errors, and package-script invocation
SO THAT `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/` can stay focused on command behavior
CAN still prove the user-facing CLI entry point routes current spec-domain commands hermetically

## Assertions

- ALWAYS: a rejected target makes `spx spec context list` and `show` write a stderr diagnostic naming the failure kind and the rejected operand, and every canonical match when the target is ambiguous
- ALWAYS: a missing selected document makes `spx spec context list` and `show` write a stderr diagnostic naming the failure kind and the missing document's path
- ALWAYS: an unresolved citation makes `spx spec context list` and `show` write a stderr diagnostic naming the failure kind, the cited path, and the citing document
- ALWAYS: malformed source makes `spx spec context list` and `show` write a stderr diagnostic naming the failure kind and the source path
- ALWAYS: a methodology failure makes `spx spec context list` and `show` write a stderr diagnostic naming the failure kind and the declared methodology version or the missing methodology resource
- ALWAYS: a rejected target, a missing selected document, an unresolved citation, malformed source, or a methodology failure makes `spx spec context list` and `show` exit non-zero with empty stdout
- ALWAYS: a valid `spx spec context list` or `show` projection, an empty one included, exits zero
- Given the packaged executable, when targetless and targeted `spx spec context show` run in text and JSON, then the selected document and reference entries are preserved across representations
- Given the packaged executable, when `spx spec context list <targets...>` runs, then it emits the structural manifest
- Given the packaged executable, when `spx spec context show` receives `--content`, then it rejects the option

### Scenarios

- Given the packaged executable runs in a temp product directory with a current `spx/` tree, when `spx spec status` is invoked through the process boundary, then it exits successfully and renders current spec-tree status output ([test](tests/spec-cli-contract.scenario.l2.test.ts))
- Given the packaged executable runs in a temp product directory whose current `spx/` tree carries no co-located tests, when `spx spec status --update` is invoked through the process boundary, then it exits successfully and renders each node's lifecycle state ([test](tests/spec-cli-contract.scenario.l2.test.ts))
- Given the packaged executable runs in a temp product directory with a current `spx/` tree, when `spx spec next` is invoked through the process boundary, then it exits successfully and renders the selected next node ([test](tests/spec-cli-contract.scenario.l2.test.ts))
- Given an unsupported `spx spec status` format is passed through the process boundary, when the command runs, then it exits non-zero with a deterministic diagnostic ([test](tests/spec-cli-contract.scenario.l2.test.ts))
- Given a temp product directory contains `spx/EXCLUDE` and product configuration files, when `spx spec apply` is invoked through the process boundary, then the spec domain rejects the command without writing product configuration files ([test](tests/spec-cli-contract.scenario.l2.test.ts))

### Compliance

- ALWAYS: contract tests invoke the packaged executable without network access or remote services ([test](tests/spec-cli-contract.compliance.l2.test.ts))
- NEVER: contract tests share mutable state with the invoking agent outside the temp product directory ([test](tests/spec-cli-contract.compliance.l2.test.ts))
- NEVER: command handlers write to product configuration files such as `spx.config.toml`, `spx.config.json`, `spx.config.yaml`, `package.json`, `pyproject.toml`, or `tsconfig.json` ([test](tests/spec-cli-contract.compliance.l2.test.ts))
