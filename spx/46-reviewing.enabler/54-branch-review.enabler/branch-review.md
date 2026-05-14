# Branch Review

PROVIDES local review execution for the current branch
SO THAT `spx review branch`
CAN compare branch changes against the configured base and produce persisted review findings

## Assertions

### Compliance

- ALWAYS: branch review resolves base and head from review config and git state ([review])
- ALWAYS: branch review uses hermetic reviewer execution and persisted review state ([review])
- NEVER: branch review depends on pull request metadata being available ([review])
