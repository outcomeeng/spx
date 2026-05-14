# Hermetic Review Execution

PROVIDES isolated local execution for configured reviewer agents
SO THAT `spx review`
CAN run reviewers without sharing mutable state with the invoking agent

## Assertions

### Compliance

- ALWAYS: reviewer agents execute with isolated work, runtime config, environment, and artifact state ([review])
- ALWAYS: review subprocesses use the process lifecycle boundary specified by `spx/13-cli.enabler/cli.md` for signal and pipe-close handling ([review])
- NEVER: reviewer execution writes to invoking-agent runtime files unless the target path is explicitly configured for generated output ([review])
- NEVER: let reviewer processes mutate the invoking agent's runtime configuration or conversation state ([review])
