# Plan: Agent session search

Remaining work on agent-session search. The first section is the next executable slice; the
items after it are independent and wait on the declarations they name.

## Native locator for selector candidacy

Search locates candidate transcripts with ripgrep and touches only the transcripts it names.
The domain stops reading transcript bytes to decide anything: a `TranscriptLocator` port takes
store roots and one literal needle and returns the paths containing it, and every spx-specific
judgment — session identity, per-record scope, dedupe, subagent attribution, match reasons —
runs on those hits. Candidates and results are different counts: on the 6.0 GB,
7,796-transcript store, `rg -l` names the 74 files containing the literal
`work/chat-voice-core` across all three stores in 1.2–2.8s, and the search reduces those 74
candidates to the one session it returns today. The in-process byte scan the locator
replaces takes 28s to reach the same 74 files, and no
in-process scan can close that gap because `rg` memory-maps, searches with SIMD, parallelizes
across files, and exits each file at its first hit.

### Decisions this slice rests on

- ripgrep is a required dependency of the locator-dependent selectors. When it is absent,
  `--contains`, `--pickup-id`, `--branch`, and `--session-id` fail with a diagnostic naming the
  install; a selector-free listing, which reads opening metadata only, keeps working.
- ripgrep enters the evidence at L1 as a standard developer tool, on the same footing as git:
  real `rg` over temporary files.
- `spx/spx.product.md` gains a carve-out: the 100 ms bound covers commands that read repository
  state; a command scanning an agent-native transcript store is bounded by the native locator's
  time over that store.
- One locator serves every selector. The Claude session-address resolver is replaced: a session
  id is located as a needle across every store, so Codex and Pi gain id lookup and the
  traversal guard becomes moot because no id ever forms a path. This trades the ADR's cost
  argument for the resolver against one mechanism, and the measured terms are close on a
  warm cache — the resolver's stat probes answer in 1.1–2.0s through the built CLI, the
  locator names the 81 candidate files in 1.2s and then reads 81 opening heads. The resolver
  reads no transcript at all, so it is cache-independent, while the locator reads the whole
  store and is slower on a cold cache by whatever the disk costs; that is the accepted
  trade-off, and the ADR update states it in place of the resolver's cost rationale rather
  than deleting the argument silently.
- One pull request carries the port, the adapter, the rewire, and the deletions, in separate
  commits, so `main` never holds both mechanisms.

### Target design

`TranscriptLocator` lives in `src/domains/agent/search/` as a typed port:
`locate(roots: readonly string[], needle: string): Promise<readonly string[]>`. Its production
adapter is a ripgrep runner under `src/lib/ripgrep/`, mirroring the git runner in
`src/lib/git/` and receiving an `execa`-shaped dependency the same way `GitDependencies` does;
`spx/13-cli.enabler/15-cli-architecture.adr.md` keeps process mechanics out of the CLI layer,
so the command layer only wires the runner in, beside `nodeAgentSearchFileSystem`.

The locator is line-oriented: `rg` matches within a line, so a needle carrying a newline can
never match, where a substring search over the whole text would. Every selector needle spx
composes — a branch name, a pickup marker, a session id — is newline-free, and `--contains`
rejects a literal carrying a newline with a diagnostic. The byte-equals-text invariant is
declared over newline-free needles, and the property generator excludes them by construction
rather than by chance.

The adapter's invocation, every flag of which is a correctness bug when omitted:

```text
rg -l -F -a --hidden --no-ignore --no-messages -0 -g '*.jsonl' -- <needle> <roots...>
```

- `-l` names files only; `-F` treats the needle as a literal, since a branch name is not a regex.
- `-a` treats every file as text: a transcript carrying a NUL byte is otherwise treated as
  binary and matches after the NUL are lost. On the real store `-a` names the same 74 files.
- `--hidden` and `--no-ignore`: all three stores live under dotfolders, and a `.gitignore`
  anywhere above them would otherwise silently exclude transcripts.
- `-0` NUL-separates paths, so a path carrying a newline survives.
- Exit code 1 is "no match" and yields an empty set; exit code 2 is an error; `ENOENT` on the
  binary is the absent-ripgrep diagnostic.

Selector candidacy becomes set algebra over locator results:

- `--contains` and `--pickup-id` each yield a path set; a row must lie in every content set.
- `--branch` yields the set of transcripts naming the branch. That set drives command
  evidence, per-record association, and sibling association. A transcript in the branch set
  but outside the content set is never a row, yet its recorded branch still associates a
  sibling transcript of the same session that is — the rule the existing `search.mapping`
  evidence enforces. Worktree-root association is declared for a session whose transcript
  never names the branch, so a branch query still lists the in-window transcripts and reads
  their opening metadata; the locator removes the byte scan over all history, not that
  listing. The branch candidate set is the union of the locator's hits and the in-window
  listing, and only the hits are ever read past their head.
- `--session-id` yields every transcript containing the id string — on the real store 81
  files, most of them other sessions that merely mention it. Head-metadata identity still
  decides: a candidate is a row only when its own opening metadata carries that session id.
  The locator replaces enumeration, never the identity check.
- A selector-free listing calls no locator and keeps the opening-directory admission.

Removed with the rewire: `src/domains/agent/search/byte-scan.ts`, the `readBytes` and
`decodeText` members of the search filesystem boundary, `decodeWarranted`, the in-memory
decode, `claudeSessionIdTranscriptFiles`, `addressesOneStoreEntry`, the `locateSessionId`
adapter slot, and the `readBytes`, `bytesReadPaths`, `decodeText`, and `decodedPaths` surface
of `MemoryAgentSessionFileSystem`. `readText` returns to the boundary and is called on hits only.

### Declarations to align

- `spx/spx.product.md`: the store-scan carve-out under the CLI latency compliance assertion.
- `spx/46-agent.enabler/32-search.enabler/21-search-adapters.adr.md`: the decision moves from
  "candidacy over undecoded bytes" to "candidacy from a native locator". The invariant that a
  needle's bytes occur exactly when the needle occurs in the decoded text is re-homed to the
  locator. New invariants: no transcript outside a locator result set is read for a
  locator-dependent selector; a session id is located, never addressed as a path. The
  session-address resolver paragraphs and the traversal boundary are replaced by the
  one-mechanism decision and its stated cost trade-off; the undecoded-bytes rationale is
  removed.
- `spx/46-agent.enabler/32-search.enabler/search.md`: the `--session-id` mapping names the
  locator; the decode-boundary compliance rule becomes "NEVER: a locator-dependent selector
  reads a transcript the locator did not name"; the store-enumeration and path-separator rules
  are removed as moot; a compliance rule declares the absent-ripgrep failure scope; the
  byte-scan property becomes the locator property.

### Evidence

- Property, L1, real `rg` over temporary files: the locator names exactly the files whose
  text contains the needle, over an open Unicode grapheme domain — the existing
  `arbitraryTranscriptNeedleCase` generator, re-pointed at files on disk.
- Compliance, L1, in-memory locator: a fake that greps the memory store's contents preserves
  the boundary; the existing `readHead` and `readText` recordings then prove no transcript
  outside the result set is read, through the moving-session and Codex scenarios that already
  reach `scanTranscript` and both collectors.
- Compliance, L1, injected runner throwing `ENOENT`: locator-dependent selectors fail with the
  diagnostic and nothing is read; the selector-free listing still returns.
- Mutation litmus before dispatching any gate: a locator returning every path in the store
  must fail the boundary evidence.

### Facts to verify before the first CI run

- ripgrep is present on the runner image behind `ubuntu-latest`, `RUNNER_X2`, and `RUNNER_X4`
  in `.github/workflows/deterministic-verification.yml`. If absent, add an install step to
  that workflow in the same pull request; the L1 lane depends on it.
- The `-0` and `-F` flags exist on every ripgrep version the runner and developer machines
  carry; version 15.2 is what the store measurement used.

### Done criteria

- Differential check on one store snapshot: for `--branch work/chat-voice-core`,
  `--contains work/chat-voice-core`, and `--session-id 080e9a4e-08eb-4a09-8825-96f60ef94b02`,
  the locator-backed search returns row for row what the in-process implementation returns
  on the same snapshot — 1, 8, and 1 rows at the time of the plan, reduced from 74, 74,
  and 81 locator candidates; the branch and content queries share one literal, so they share
  one candidate set and differ only in how the domain reduces it.
- Wall clock on that snapshot, warm cache: the locator's own time plus the in-window
  listing's head reads. Measure both terms before setting the bound; three seconds for the
  branch and content queries and two seconds for the session-id query are the expectations,
  not derived numbers, and the session-id bound must hold against the 1.1–2.0s the resolver
  it replaces measures today.
- The boundary evidence is green and survives its mutation litmus.
- The "Selector search cost" entry in [ISSUES.md](ISSUES.md) closes with the measurement.

### Verification route

`tsx src/cli.ts test spx/46-agent.enabler/32-search.enabler`, then
`tsx src/cli.ts test --changed --base origin/main`, `pnpm run validate`, the full-suite
status projection, the `/apply` gates, and `/merge`.

## Independent items

- Add `spx diagnose sessions` as a consumer of the search library, joining SPX handoff session
  records, worktree claims, and agent-native transcript hits into a triage report.
- Add a pull-request-number selector after the accepted transcript patterns for pull-request
  references are declared. Until then, `--contains` provides literal forensic search without
  embedding one repository host's wording.
- Feed search results into resume only after the shared result shape and bounds are declared
  for that integration.
- Declare lineage-based subagent association before mapping subagent transcripts back to
  top-level sessions.
- Declare which recorded position wins when one transcript records the requested branch more
  than once with differing working directories. The reader reports the first occurrence today;
  no assertion states that, and a session that leaves a branch and returns is the case at stake.
- Cover the interaction between per-record branch association and same-product worktree-root
  association for one session: a branch-bearing record whose working directory lies outside the
  product root but inside a branch-associated worktree root. Each association path carries its
  own evidence today; their combination does not.
