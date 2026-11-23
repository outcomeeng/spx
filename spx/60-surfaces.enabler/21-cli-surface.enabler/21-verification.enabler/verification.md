---
id: 01a118d3-682b-7b50-8e97-556ab500631f
---

# Verification

PROVIDES the public `spx verification` command family — the run-inspection command paths every verification run is read through, including the listing of the runs recorded for one Change and the comparison of two of that Change's runs, and the vocabulary boundary its child command paths observe
SO THAT agents, CI jobs, and launchers recording a verification run, callers asking spx to execute one, and the holders of a Change counting the runs its gates made and weighing a later run's findings against an earlier run's
CAN address, inspect, and render any verification run through one command family without constructing journal events directly, read a Change's runs by verification type without holding their run tokens, and tell a file two of a Change's runs both judged whose content changed between their head commits from one whose content stayed the same

## Test.Scenario: change runs

- [list-includes-run](tests/run-list.scenario.l2.test.ts):
  - Given a run started through `spx verification run start --change <owner/repo#N>`
  - When `spx verification run list --change <owner/repo#N>` runs
  - Then it reports that Change's listing as JSON, and the listing includes that run
- [compare-reports-change](tests/run-compare.scenario.l2.test.ts):
  - Given two runs of one Change whose head commits differ in one file both runs judged
  - When `spx verification run compare --change <owner/repo#N>` runs with the two runs' `--run <run-token>` values
  - Then it reports as JSON that file changed, and every other file both runs judged unchanged

## Test.Conformance: compare lookup

- [compare-lookup-diagnostic](tests/run-compare-lookup.conformance.l2.test.ts): ALWAYS: when a `--run` value of `spx verification run compare` names no run of the Change, or more than one, the diagnostic names the `--change` value, that `--run` token, and the searched target

## Test.Compliance: run inspection

- [list-requires-change](tests/run-list.compliance.l2.test.ts): ALWAYS: `spx verification run list` rejects an invocation without `--change`, so the listing never defaults to every run in the store
- [list-read-only](tests/run-list.compliance.l2.test.ts): NEVER: `spx verification run list` appends a journal event or seals a run
- [compare-same-change](tests/run-compare.compliance.l2.test.ts): ALWAYS: `spx verification run compare` rejects two runs that are not both runs of the named Change, or a run that recorded no head commit
- [compare-two-runs](tests/run-compare-arguments.compliance.l1.test.ts): ALWAYS: `spx verification run compare` rejects an invocation naming `--run <run-token>` zero, one, or three or more times, before any comparison runs
- [compare-no-input](tests/run-compare-arguments.compliance.l1.test.ts): NEVER: `spx verification run compare` accepts a fresh `--input <input-source>` value
- [compare-read-only](tests/run-compare.compliance.l2.test.ts): NEVER: `spx verification run compare` appends a journal event or seals a run
- [no-journal-mechanics](tests/verification.compliance.l1.test.ts): NEVER: public verification command paths expose journal mechanics such as `append-scope`, `append-finding`, `event`, or `journal`
- [no-top-level-verb](tests/verification.compliance.l1.test.ts): NEVER: a top-level verb command such as `spx verify` manages verification runs

## Audit: run inspection

- run-inspection-paths: ALWAYS: every verification run is inspected and rendered through the run-inspection command paths of `spx verification run`, whichever child command path produced it
