# PR Review

PROVIDES local review execution for pull request targets
SO THAT `spx review pr <number>`
CAN resolve PR metadata, materialize the review target, and produce persisted review findings

## Assertions

### Compliance

- ALWAYS: PR review records pull request number, base ref, head ref, head SHA, and reviewer identifiers in persisted state ([review])
- ALWAYS: PR review executes reviewers hermetically after target metadata is resolved ([review])
- NEVER: PR review mutates remote pull request state unless a separate command explicitly owns that behavior ([review])
