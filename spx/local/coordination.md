# Change Coordination

Loaded by `/claim-change`, `/release-change`, `/close-change`, and `/author-change` when present. It names where this repository's Changes and Handoffs live, per methodology `versions/4.0/methodology/change/changes.md` and the GitHub realization it cites. Values only; the workflow is the skill's.

## Change store

- Repository: `outcomeeng/changes` (one issue per Change; issues only)
- Project: owner `outcomeeng`, number `1` (`https://github.com/orgs/outcomeeng/projects/1`)
- Product: `spx` — the `Product` field value for every Change this repository picks up or hands off
- Fields: `Product` (methodology | spx | plugins), `Maturity` (Proposed | Framed | Sliced | Executable), `Status` projects Lifecycle (Available | Claimed | Applied | Refined | Abandoned)
