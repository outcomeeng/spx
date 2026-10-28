# Verify

PROVIDES typed verification-run lifecycle operations over the verification-context and journal substrate
SO THAT whichever party drives a scoped verification run — an agent, a CI job, a launcher, or spx executing a runner
CAN learn the directories a run will write before it starts, start one scoped run with a stable run locator, read the exact verification input, record inspected scope and validated findings, finish the run, inspect resumable status, and render the journal projection without constructing journal events directly

## Assertions

### Mapping

- Given a verification type and a changeset or file scope, when the write-path report runs, then it returns the canonical scope identity, the branch key, the journal runs directory and verification-context directory at the Git common-dir product root into which a run started for that type, scope, and branch key writes, and the payload root `.spx/worktree/<verification-type>/payloads/` at the local worktree root ([test](tests/write-paths.mapping.l1.test.ts))
- Given a reported directory below a symbolic link, or a directory that does not exist, when the write-path report runs, then the directory's path resolves the link of its nearest existing ancestor, and a missing directory reports itself absent with the missing directories from that ancestor down ([test](tests/write-paths.mapping.l1.test.ts))

### Compliance

- NEVER: the write-path report creates, changes, or removes a file or directory ([test](tests/write-paths.compliance.l1.test.ts))
- NEVER: a caller hand-formats the journal event envelope for a verification run; verification-run lifecycle operations construct journal events from typed lifecycle inputs ([audit])
- ALWAYS: verification-run lifecycle operations record and render a run whichever party drives it — an agent, a launcher, or spx executing a runner ([audit])
- NEVER: verification-run lifecycle operations launch, configure, or select a verification agent — an agentic verification is judged by an agent the agent harness launches, per [`spx/12-agent-harness.pdr.md`](spx/12-agent-harness.pdr.md) ([audit])
