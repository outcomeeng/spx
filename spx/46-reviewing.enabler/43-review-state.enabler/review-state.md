# Review State

PROVIDES persisted local review observations and latest-review lookup
SO THAT review status commands
CAN inspect branch and pull request review evidence without re-running reviewers

## Assertions

### Compliance

- ALWAYS: review run state is stored under `.spx/review/{target-kind}/{target-slug}/runs/{run-directory}` at the Git common-dir product root ([review])
- ALWAYS: review state records target identity, reviewer identifiers, base/head metadata, config digest, timestamps, output paths, and terminal status ([review])
- ALWAYS: latest-review lookup is deterministic for a target and excludes incomplete or parse-invalid state from terminal status ([review])
- NEVER: use audit state files as review state without an explicit shared storage decision ([review])
