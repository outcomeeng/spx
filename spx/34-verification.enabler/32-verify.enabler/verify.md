---
id: 01a2034e-dbcc-7098-ad39-1afb32cee67a
---

# Verify

PROVIDES typed verification-run lifecycle operations over the verification-context and journal substrate
SO THAT whichever party drives a scoped verification run — an agent, a CI job, a launcher, or spx executing a runner
CAN learn the directories a run will write before it starts, start one scoped run with a stable run locator, read the exact verification input, record inspected scope and validated findings, finish the run, inspect resumable status, and render the journal projection without constructing journal events directly

## Test.Mapping: [write-path-report](tests/write-paths.mapping.l1.test.ts)

For a verification type and a changeset or file scope, the write-path report returns the canonical scope identity and the branch key, and reports for each directory role the directory, at the Git common-dir product root, into which a run started for that type, scope, and branch key writes.

| Case                 | Reported directory                                         |
| -------------------- | ---------------------------------------------------------- |
| journal-runs         | `.spx/branch/<branch-slug>/<verification-type>/runs/`      |
| verification-context | `.spx/branch/<branch-slug>/verification-context/contexts/` |
| payloads             | `.spx/branch/<branch-slug>/<verification-type>/payloads/`  |

## Test.Mapping: [write-path-resolution](tests/write-paths.mapping.l1.test.ts)

For each reported directory, the write-path report resolves the symbolic link of the directory's nearest existing ancestor, and reports a directory that does not exist as absent, with the missing directories from that ancestor down.

| Case           | State store                                                            | Report                                                                        |
| -------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| no-state-store | absent from the checkout                                               | every directory absent, with the directories to create                        |
| other-type-run | holds the directory a started run of another verification type created | that directory existing, and each other directory absent below the branch key |
| linked-store   | a symbolic link to another location                                    | the resolved path of every directory                                          |

## Test.Compliance: write-path report

- [write-paths-read-only](tests/write-paths.compliance.l1.test.ts): NEVER: the write-path report creates, changes, or removes a file or directory

## Audit: lifecycle operations

- typed-journal-events: NEVER: a caller hand-formats the journal event envelope for a verification run; verification-run lifecycle operations construct journal events from typed lifecycle inputs
- any-driving-party: ALWAYS: verification-run lifecycle operations record and render a run whichever party drives it — an agent, a launcher, or spx executing a runner
- no-agent-selection: NEVER: verification-run lifecycle operations launch, configure, or select a verification agent — an agentic verification is judged by an agent the agent harness launches

## Audit: payloads

- payload-working-input: NEVER: a payload source staged in a run's payload directory is committed; a tracked file under `.spx/`, or a repository ignore rule that admits a file under `.spx/branch/`, fails.
