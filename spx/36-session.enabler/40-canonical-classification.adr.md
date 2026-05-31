# Canonical Session Classification

## Purpose

This decision governs how the session domain distinguishes a canonical session — one whose frontmatter conforms to the shape declared by [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](11-session-frontmatter.pdr.md) — from a non-canonical session, and how that classification relates to the tolerant reader that `list`, `show`, `pickup`, and `release` depend on.

## Context

**Business impact:** `spx session archive` applies the non-empty-`result` requirement only to canonical sessions; a non-canonical session is archived as-is. The two behaviors need a single, deterministic classifier so the archive path and the read path never disagree about what a session is.

**Technical constraints:** [`spx/36-session.enabler/32-session-identity.enabler`](32-session-identity.enabler/session-identity.md) declares `parseSessionMetadata` as a tolerant reader: it returns defaults for missing fields, silently drops keys outside the shape, and never throws — every read command relies on this so no session is ever unreadable. Classification for archive needs the opposite: a frontmatter that carries a key outside the declared shape or omits a required handoff field must be detectable, and the detection must not depend on the YAML library's leniency toward unrecognized keys.

## Decision

The session domain carries two parsers with opposite error contracts: the tolerant reader (`parseSessionMetadata`) that never throws, and a strict canonical classifier — a pure function that accepts session content and throws when the frontmatter carries a key outside `SESSION_FRONT_MATTER`, omits a required handoff field, or carries a field whose value does not match its declared type, and otherwise returns the canonical metadata.

## Rationale

Read and archive ask different questions of the same bytes. A read renders whatever exists and must tolerate every session, so its parser returns defaults and never throws. Archive decides whether the `result` contract binds, which requires a yes/no classification with a hard boundary: a frontmatter is canonical or it is not. Encoding "not canonical" as a throw lets the archive orchestrator express the policy as a single try/branch and normalizes every non-conformance — extra keys, missing handoff fields, malformed YAML — into one observable signal.

A single parser cannot serve both. A tolerant parser that returns defaults cannot report that a `tags` key was present, because tolerance means dropping it; a strict parser that throws on non-conformance cannot back the read commands, because a thrown read makes a session unviewable. The two contracts are mutually exclusive, so two functions are the minimum.

Alternatives rejected:

- **Extend `parseSessionMetadata` with a strict mode flag** — one function with two contradictory contracts invites callers to pass the wrong flag, and a read path that can throw under a flag is one regression away from an unviewable session.
- **Classify on the parsed metadata of the tolerant reader** — the tolerant reader has already dropped excluded keys by the time it returns, so a `tags`-bearing session is indistinguishable from a clean one. Classification must see the raw key set before tolerance erases it.
- **Compare against a lenient schema that ignores unknown keys** — a session carrying the full shape plus `tags` would pass, contradicting the declared boundary. The classifier rejects unrecognized keys explicitly.

## Trade-offs accepted

| Trade-off                                                                       | Mitigation / reasoning                                                                                                |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Two parsers over one shared parser                                              | The contracts are opposite by design; one function cannot both tolerate and reject. Each is small and pure            |
| The classifier re-extracts and re-parses the frontmatter the reader also parses | Parsing a session's frontmatter is microseconds; archive runs per session, not in a hot loop                          |
| A canonical session with an empty `result` is rejected, not archived            | The canonical contract requires the agent to record a result before archiving; only non-canonical sessions are exempt |

## Invariants

- For every session content string, the tolerant reader returns a value and never throws.
- For every session content string, the canonical classifier either returns canonical metadata or throws — it has no third outcome.
- A content string the classifier accepts has frontmatter whose key set is a subset of `SESSION_FRONT_MATTER`, includes every required handoff field, and carries a value matching the declared type of each present field; a content string it rejects violates at least one of those conditions or carries no parseable frontmatter.

## Compliance

### Recognized by

A pure classifier function in `src/domains/session/` throws on non-canonical frontmatter while `parseSessionMetadata` returns defaults without throwing, and the archive orchestrator applies the `result` check only on the branch where classification succeeds.

### MUST

- The canonical classifier is a pure function that accepts session content and returns canonical metadata, deriving its accepted key set from `SESSION_FRONT_MATTER` and its required-key set from the five keys [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](11-session-frontmatter.pdr.md) recognizes a canonical session by — `priority`, `branch`, `worktree`, `goal`, `next_step` — so pure input enables `l1` verification with literal content and no mocking ([review])
- The canonical classifier throws a single typed session error for every non-conformance — a key outside the shape, a missing required handoff field, a field whose value does not match its declared type, or unparseable frontmatter — so the archive orchestrator branches on one observable signal ([review])
- Classification logic lives in `src/domains/session/` and archive I/O orchestration in `src/commands/session/`, consuming the classifier through a direct pure call per [`spx/14-cli-composition.adr.md`](../14-cli-composition.adr.md) ([review])
- The archive orchestrator applies the non-empty-`result` requirement only when the classifier accepts the session, and archives without that requirement when the classifier throws ([review])

### NEVER

- The tolerant reader (`parseSessionMetadata`) throws on malformed or non-canonical frontmatter — read commands tolerate every session per [`spx/36-session.enabler/32-session-identity.enabler`](32-session-identity.enabler/session-identity.md) ([review])
- The tolerant reader and the canonical classifier are merged into one function or share a mode flag — their error contracts are opposite by design ([review])
- The classifier decides canonicality from the tolerant reader's output — tolerance has already erased the excluded keys it must detect ([review])
- `vi.mock()`, `jest.mock()`, or filesystem mocking appears in tests for the classifier or the archive path — the classifier is exercised with literal content strings and the archive path with real temp-directory fixtures ([review])
