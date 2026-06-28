# Precommit Git Environment Test Harness

PROVIDES an isolated git environment for precommit integration tests — a temporary repository with the product's `package.json`, vitest config, and tsconfig copied in, the product's `node_modules` and lefthook configuration symlinked in, lefthook hooks installed, and a callback context whose `exec` runs a command in the environment and whose `writeFile` writes a file relative to the environment root
SO THAT the precommit enabler's integration tests
CAN drive real git, lefthook, and `spx test` behavior against the actual product configuration and read every command's exit code, stdout, and stderr through one `ExecResult` shape whether the command succeeds or exits non-zero

## Assertions

### Scenarios

- Given a provisioned git environment, when the callback writes a file through `writeFile` and runs both a zero-exit command and a command whose process exits non-zero through `exec`, then `writeFile` creates the file under the environment root and each `exec` call returns an `ExecResult` carrying the command's exit code, stdout, and stderr — a non-zero process exit reported through the returned result rather than thrown ([test](tests/test-harness.scenario.l1.test.ts))
- Given a provisioned git environment, when `exec` runs a command that cannot be spawned, then the error propagates to the caller rather than being reported as an `ExecResult` ([test](tests/test-harness.scenario.l1.test.ts))
