# Review State

PROVIDES branch- and pull-request-scoped review run journals and the `ReviewRunState` projection folded from a run's event history
SO THAT review status commands
CAN inspect branch and pull request review evidence without re-running reviewers

## Assertions

### Compliance

- ALWAYS: a review run is an append-only event journal stored under `.spx/branch/{branch-slug}/review/runs/run-{run-token}.jsonl` for branch targets and `.spx/branch/pr-{number}/review/runs/run-{run-token}.jsonl` for pull-request targets at the Git common-dir product root, per `spx/46-reviewing.enabler/15-review-directory.adr.md` ([test](tests/run-file.scenario.l1.test.ts))
- ALWAYS: branch target slugs reuse the state-store slug implementation within the 120-byte component limit, and pull-request target slugs encode an unsigned base-10 `pr-{number}`, per `spx/46-reviewing.enabler/15-review-directory.adr.md` ([test](tests/branch-slug.property.l1.test.ts), [test](tests/pr-slug.property.l1.test.ts))
- ALWAYS: the `ReviewRunState` projection folds target identity, reviewer identifiers, base/head metadata, config digest, timestamps, output paths, and terminal status from the run's event history ([test](tests/run-state.scenario.l1.test.ts))
- ALWAYS: a run folds to terminal review evidence only when its journal is sealed and holds a terminal-completion event ([test](tests/run-state.scenario.l1.test.ts))
- ALWAYS: latest-review lookup orders runs per `spx/46-reviewing.enabler/15-review-directory.adr.md` — greatest `completedAt`, then greatest `startedAt`, then lexicographically greatest run-file name ([test](tests/run-state.scenario.l1.test.ts))
- ALWAYS: branch and pull-request run lookup ignore entries whose file names do not match the run-file format before constructing run-file paths ([test](tests/run-state.scenario.l1.test.ts))
- NEVER: treat an unsealed run, or one whose history holds no terminal-completion event, as approved or rejected review evidence ([test](tests/run-state.scenario.l1.test.ts))
- NEVER: use audit domain records as review state ([audit])
