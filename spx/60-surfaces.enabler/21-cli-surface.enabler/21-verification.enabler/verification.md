---
id: 01a118d3-682b-7b50-8e97-556ab500631f
---

# Verification

PROVIDES the public `spx verification` command family — the run-inspection command paths every verification run is read through, including the listing of the runs recorded for one Change, and the vocabulary boundary its child command paths observe
SO THAT agents, CI jobs, and launchers recording a verification run, callers asking spx to execute one, and the holders of a Change counting the runs its gates made
CAN address, inspect, and render any verification run through one command family without constructing journal events directly, and read a Change's runs by verification type without holding their run tokens

## Assertions

### Scenarios

- Given a run started through `spx verification run start --change <owner/repo#N>`, when `spx verification run list --change <owner/repo#N>` runs, then it reports that Change's listing as JSON, and the listing includes that run ([test](tests/run-list.scenario.l2.test.ts))

### Compliance

- ALWAYS: every verification run is inspected and rendered through the run-inspection command paths of `spx verification run`, whichever child command path produced it ([audit])
- ALWAYS: `spx verification run list` rejects an invocation without `--change`, so the listing never defaults to every run in the store ([test](tests/run-list.compliance.l2.test.ts))
- NEVER: `spx verification run list` appends a journal event or seals a run ([test](tests/run-list.compliance.l2.test.ts))
- NEVER: public verification command paths expose journal mechanics such as `append-scope`, `append-finding`, `event`, or `journal` ([test](tests/verification.compliance.l1.test.ts))
- NEVER: a top-level verb command such as `spx verify` manages verification runs ([test](tests/verification.compliance.l1.test.ts))
