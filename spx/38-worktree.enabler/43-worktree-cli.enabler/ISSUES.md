# Known Issues

## No worktree-cli scenario covers a release whose session id comes from the environment

The CI review of the release-by-session-id changeset raised this finding on its final head (`DEBT [evidence]`, `tests/worktree-cli.scenario.l1.test.ts:902`):

> `src/commands/worktree/release.ts` (lines 55-57) now branches on `explicitSessionId` — when it is defined, it calls `removeClaimBySessionId(worktreesDir, name, sessionId, options.processTable, mutation)` and never reaches the full-holder-match `removeClaim` call below it. The pre-existing test at line 902 passes `sessionId: otherSessionId` (line 927) together with `env` set to `CONTROLLING_PID_ENV` mapped to `String(ownedRecord.pid)` (line 923) — under the new routing this `sessionId` value is treated as an explicit `--session-id`, so the test now exercises `removeClaimBySessionId` (a bare session-id comparison) instead of the full-holder-match `removeClaim` branch it exercised before this changeset, even though its name and the spec scenario describe a generic different-session release failure. No test in this file calls `releaseCommand` with `sessionId` omitted (session resolved ambiently from `CLAUDE_SESSION_ID` or `CODEX_THREAD_ID`) against a claim whose controlling process differs from the caller's, so the ambient/full-holder-match failure branch of the CLI-level routing this changeset introduces is left unexercised.

**Impact:** an inverted `explicitSessionId` check in `releaseCommand` — every release taking the session-id-only path — passes this node's suite.

**Settlement condition:** a worktree-cli scenario omits `sessionId`, resolves the identity from the environment against a claim whose live controlling process differs from the caller's, and asserts the not-owner release error. The scenario at line 902 and its spec line in `worktree-cli.md` are renamed or re-described to name the explicit-session-id branch they now exercise.

## Test-evidence audit findings on text older than the release-by-session-id changeset

The test-evidence audit of this node at `da83f3287273dd4ecedca24be1aad9641d9f974d` returned `REJECTED` with ten findings. The release-by-session-id changeset touches this node's tests in one hunk (`worktree-cli.scenario.l1.test.ts`, lines 867-901), and no finding cites those lines.

- `f-001` — `tests/worktree-name.property.l1.test.ts`: both properties call `fc.assert(fc.property(...))` directly with fast-check defaults and bypass `assertProperty` in `testing/harnesses/property/property.ts`, so a failing run reports no seed and cannot be replayed.
- `f-002` — `testing/harnesses/worktree/harness.ts`: `withControllingPidOverrideEvidence`, `withAgentAncestorEvidence`, and `withImmediateParentControllingProcessEvidence` return the expected outcome (`processPid`, `startedAt`, `host`) the controlling-process scenarios compare against, so the harness decides which pid is correct.
- `f-003` — `tests/worktree-cli.scenario.l1.test.ts`: the file declares `worktreeListDeps`, `pathAwareWorktreeListDeps`, `worktreeListUnavailableDeps`, `notGitDeps`, and `isPathInsideOrEqual`, controlled git implementations with canned exit codes and a path-containment rule that duplicate the owned doubles in `testing/harnesses`.
- `f-004` — `tests/worktree-name-resolution.mapping.l1.test.ts`: the file declares `duplicateBasenameGitDeps` and `absentPathInfo`; `absentPathInfo` is also declared in `testing/harnesses/worktree/command-output.ts`.
- `f-005` — the same file, scope-override mapping: one sampled working directory and relative name feed `resolveWorktreesDir`, and the claim, release, and status sharing clause is covered only by the unlinked scenario file.
- `f-006` — `tests/worktree-cli.compliance.l2.test.ts`: `expectedFreeStatusEntriesFromGitWorktreeList` re-implements the production worktree-list parsing with production constants, so a shared parsing defect cancels out.
- `f-007` — `tests/output-escaping.compliance.l1.test.ts`: the text-report and refusal tests assert only that no control byte or DEL remains, so a mutation that deletes control bytes instead of escaping them passes; `independentlyEscapeTerminalText` in `testing/generators/terminal-text/terminal-text.ts` is never used.
- `f-008` — the evidence chain: the bodies of the worktree-layout harness, the session harness, the session generators, and several production modules were not fully inspected.
- `f-009` (warning) — `tests/worktree-name-resolution.mapping.l1.test.ts`: the denoting forms are a hand-picked list in a loop inside one `it()`, not `it.each` over a spec-owned enumeration.
- `f-010` (warning) — `tests/worktree-cli.scenario.l1.test.ts`: the shell-expansion scenario supplies only resolved sibling paths, so the unresolved-sibling and no-`undefined` clauses are not exercised there.

**Impact:** the node's tests carry harness-owned expectations, test-owned doubles, and unseeded properties, so a defect in the shared harness or in the production parser can pass the suite, and a failing property run is not replayable.

**Settlement condition:** each test-owned double moves into the node's spec-governed harness, the properties run through `assertProperty`, the controlling-process harness helpers return observations instead of expected outcomes, the compliance oracle and the escaping assertions use independent oracles, and the mapping evidence enumerates its correspondence with `it.each`. A new test-evidence audit of the node raises none of these findings.

## New scenario construction repeats an adjacent release scenario

SonarCloud's quality gate on the release-by-session-id changeset failed with 27.4% duplication on new code (required at most 3%). Of this node's 35 new lines in `tests/worktree-cli.scenario.l1.test.ts` (lines 867-901), 34 repeat the construction of the adjacent release scenarios: a pool, a claim recorded with a live controlling process, the release handler call, and the assertion on the removed claim.

**Impact:** each further release scenario copies the same construction, so the duplication rate on new code stays above the gate.

**Settlement condition:** one worktree harness function builds the claim-with-live-controlling-process construction the release scenarios share, the release scenarios call it, and the SonarCloud duplication condition holds for the scenario file.
