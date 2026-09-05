# Plan: Agent session search

Remaining work extends agent-session search after the branch-association behavior declared in [the search spec](search.md).

- Add `spx diagnose sessions` as a consumer of the search library, joining SPX handoff session records, worktree claims, and agent-native transcript hits into a triage report.
- Add a pull-request-number selector after the accepted transcript patterns for pull-request references are declared. Until then, `--contains` provides literal forensic search without embedding one repository host's wording.
- Feed search results into resume only after the shared result shape and bounds are declared for that integration.
- Declare lineage-based subagent association before mapping subagent transcripts back to top-level sessions.
- Declare which recorded position wins when one transcript records the requested branch more
  than once with differing working directories. The reader reports the first occurrence today;
  no assertion states that, and a session that leaves a branch and returns is the case at stake.
- Cover the interaction between per-record branch association and same-product worktree-root
  association for one session: a branch-bearing record whose working directory lies outside the
  product root but inside a branch-associated worktree root. Each association path carries its
  own evidence today; their combination does not.
