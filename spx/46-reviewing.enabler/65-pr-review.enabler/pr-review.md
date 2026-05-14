# PR Review

PROVIDES local review execution for pull request targets
SO THAT `spx review pr <number>`
CAN resolve PR metadata, materialize the review target, and produce persisted review findings

## Assertions

### Compliance

- ALWAYS: PR review records target kind, target slug, pull request number, reviewer identifiers, base/head metadata, review config digest, run timestamps, output paths, and terminal status in persisted state ([review](../15-review-directory.adr.md))
- ALWAYS: PR review executes reviewers hermetically after target metadata is resolved ([review])
- NEVER: PR review mutates remote pull request state unless a separate command explicitly owns that behavior ([review])
