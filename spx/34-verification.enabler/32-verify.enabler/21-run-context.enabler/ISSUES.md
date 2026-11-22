# Issues: run context

Except where an entry names another source, the entries below come from test-evidence audit run 1 of this node at `65e35d2b15b8ca92dd8afdc0ee5f4b95bf67d272`. That run returned `REJECTED` with 8 REJECT findings and 1 WARNING. Every cited line lies outside the `origin/main..HEAD` diff of the changeset under audit. The Change-identity assertions and their evidence drew no finding. The harness-owned predicate findings against `testing/harnesses/verify/harness.ts`, and the WARNING that repeats that class, are recorded under "Shared verification harness owns test predicates and unclassified Git doubles" in [`spx/34-verification.enabler/32-verify.enabler/ISSUES.md`](spx/34-verification.enabler/32-verify.enabler/ISSUES.md).

## The Change-identity assertion states a looser grammar than the pattern enforces

**Source:** the local review of head `a442b6ecc5c73055ed14a344b1879e0adfcc1aa1`, category consistency, label DEBT, accepted as debt for the merge.

The Change-identity compliance assertion in `run-context.md` defines the canonical `owner/repo#N` form by three parts: an owner, a repository name, and a positive issue number. `VERIFY_CHANGE_IDENTITY_PATTERN` in `src/domains/verify/verify.ts` (line 1779) enforces more. It limits the owner and the repository name to the characters `[A-Za-z0-9._-]`, and it rejects an issue number with a leading zero. `o/r#07` has all three parts and is still rejected.

The evidence carries the same gap. In `testing/generators/verify/verify.ts`, the doc comment of `arbitraryNonCanonicalChangeIdentity` (lines 1213–1217) says each branch removes or corrupts exactly one of the three required parts or their separators. The leading-zero branch (line 1229) builds `owner/repo#0N`, whose three parts are present and valid under the assertion's wording. `tests/verify-change-identity.compliance.l1.test.ts` draws its rejected cases from that generator, so the compliance test enforces a rule the spec does not declare.

Both entry points share the pattern through `isVerifyChangeIdentity`: `start` checks `--change` at line 770 of `src/commands/verify/cli.ts`, and the listing path, `verifyChangeRunsCommand` in `src/commands/verify/change-runs.ts`, checks it at line 94.

**Impact:** the spec and the implementation disagree on which identities are accepted. A reader of the assertion cannot predict which identities `start` and the listing path accept: an identity the assertion admits, such as one with a leading-zero issue number or a character outside the pattern's set, is rejected.

**Settlement condition:** either the assertion states the full grammar the pattern enforces, or the pattern and the generator relax to the three-part rule. In both cases the compliance evidence then judges its cases against the stated grammar.

## A failed payload sweep blocks every later start `src/commands/verify/cli.ts` `sweepClosedRunPayloadDirectories` `payload-directory-removed`

**Source:** the CI review of PR 748 at head `ea2644083d497239291ed9d247aa2081f340bd05`, category consistency, label DEBT, accepted by the SPX Maintainer's ruling. The rule is `payload-directory-removed` in [`spx/34-verification.enabler/15-run-write-paths.pdr.md`](spx/34-verification.enabler/15-run-write-paths.pdr.md).

`sweepClosedRunPayloadDirectories` in `src/commands/verify/cli.ts` returns a `PAYLOAD_SWEEP_FAILED` failure on the first payload directory whose removal throws. It returns the same failure when it cannot list the branch scopes or a payload root. `createRunPayloadDirectory` returns that failure before it creates the run's payload directory, so `start` rolls back and the new run does not start. `finish` treats the same removal failure as a diagnostic and leaves the run sealed, and `payload-directory-removed` leaves such a directory for the next `start` sweep. No line of the record states what `start` does when that sweep fails.

**Impact:** one payload directory of a sealed run that cannot be removed, through its permissions or a held file, makes every later `spx verification run start` in the repository fail, across every branch scope and verification type, until someone removes the directory by hand.

**Settlement condition:** `start` proceeds past a failed sweep and reports each directory it could not remove, while the record states that behavior.

## The payload sweep reads every branch scope for each candidate `src/commands/verify/cli.ts` `sweepClosedRunPayloadDirectories` `O(n^2) traversals where O(n) suffices`

**Source:** the CI review of PR 748 at head `ea2644083d497239291ed9d247aa2081f340bd05`, category performance, label DEBT, accepted by the SPX Maintainer's ruling.

For each candidate payload directory, `sweepClosedRunPayloadDirectories` calls `isPayloadRunClosed`, which loops over every branch scope and reads that scope's run journal until one carries a terminal-completion event or a seal. A payload directory sits under the branch scope its run's journal opened in, yet the lookup does not try that scope first. A run that never seals keeps its payload directory, so every later `start` reads its journal again.

**Impact:** each `start` costs one journal read per candidate per branch scope. Both counts grow as runs that never seal accumulate. No repository has measured the cost.

**Settlement condition:** each candidate resolves against its own branch scope first, or the sweep indexes the run journals once, as the Audit row `payload-directory-sweep` of [`spx/34-verification.enabler/32-verify.enabler/17-run-payload-directory.adr.md`](spx/34-verification.enabler/32-verify.enabler/17-run-payload-directory.adr.md) already permits.
