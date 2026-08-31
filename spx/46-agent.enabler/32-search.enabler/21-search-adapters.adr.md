# Agent Search Adapters

Agent-native session search uses a static, typed adapter set that maps each supported agent kind to its native store collector, its transcript metadata reader, and the evidence forms its transcript contract declares. A transcript records working directory and branch as a sequence of per-record values rather than one session-opening value, so search resolves a session's product scope and branch association from every recorded value in a transcript whose adapter declares a record reader, from the opening value where an adapter declares none, and reports the working directory recorded alongside the matching value. Selector evidence is located by raw byte scan before any structural parse, and a session-store directory name never excludes a transcript a selector would match. Pi sessions carry no inferred transcript branch identity or command-evidence grammar; their null-branch association uses same-product worktree roots, while Codex-specific subagent attribution remains confined to Codex transcripts.

## Rationale

A closed adapter vocabulary keeps store discovery, session classification, filtering, and result rendering exhaustive as agent support expands.

A coding-agent session outlives one working directory and one branch. A session moves between worktrees and between products, and its transcript records each move, so session-opening metadata identifies where a session began rather than where it worked. [`spx/46-agent.enabler/21-resume.enabler`](../21-resume.enabler/resume.md) reads opening metadata because resume continues the conversation a user just left, and the opening record identifies that conversation adequately inside its window. Search answers the opposite question — which session touched this branch — which a contract reading only the opening record cannot answer. One store therefore serves two consumers under two identity contracts, and each consumer declares its own.

A store-directory name derived from a working directory encodes exactly one recorded value. Treating that name as a scope gate reimposes opening-record identity through the filesystem layout and excludes sessions whose matching evidence the transcript holds. As an admission hint the same name costs nothing and excludes nothing, so it narrows work without deciding results. A selector-free listing scopes by that same opening working directory, so there the name and the scope check keep exactly the same sessions.

Structurally parsing every transcript to locate one branch or literal is unbounded work over a store that grows without limit and spans every product its user works on, which no reach window makes acceptable; [`spx/spx.product.md`](../../spx.product.md) bounds command completion at 100 milliseconds once the process is running. A raw byte scan decides candidacy at I/O cost alone, so structured parsing runs only over the transcripts that carry the needle. That scan bounds a content selector exactly, because a literal a transcript never records cannot match it. It cannot bound a branch selector, whose evidence also arrives from same-product worktree roots, accepted transcript commands, and sibling transcripts of one session — so a branch selector admits every candidate and the scan bounds only the parses beneath it. That admission holds even when a content needle accompanies the branch: a transcript missing the needle can never be a result row itself, yet its recorded branch is what associates a sibling transcript of the same session that does carry the needle, so rejecting it on the needle alone loses the association. A selector-free listing resolves from opening metadata and decodes nothing.

Rejected: widening the branch-associated worktree-root set while preserving opening-record identity. A session that begins inside one product and moves to another records no opening value that any worktree root of the invocation product covers, so the wider root set leaves it unreachable.

## Invariants

- Where an adapter declares a record reader, a transcript's contribution to product scope and branch association is a function of its whole recorded value sequence, independent of any single record's position in that sequence; where an adapter declares none, it is the opening value alone.
- The candidate set a store collector yields is a superset of the set any selector matches; no collector decision removes a session whose transcript contents the selector would match.
- Byte-scan candidacy is a superset of structural-parse candidacy: it selects the same transcripts as the structural parse for a content selector, and every candidate for a branch selector, whose evidence also arrives from worktree roots, accepted commands, and sibling transcripts of one session.

## Verification

### Testing

- ALWAYS: each supported search agent kind maps to its declared native store collector, transcript metadata reader, and declared evidence forms ([mapping])
- ALWAYS: a session whose adapter declares a record reader and whose transcript records the requested branch in any record matches a branch search and reports the working directory recorded alongside that branch, whichever field path that record carries its working directory under ([property])
- ALWAYS: a session-store directory name whose encoded working directory lies outside the invocation product scope still yields its transcripts as candidates when the selector's evidence is transcript-borne ([compliance])
- ALWAYS: byte-scan candidacy selects exactly the structurally matching transcripts for a literal-content selector, and never fewer than them for a branch selector ([property])
- ALWAYS: the reach window search applies to its default candidate set is independent of the window a resume consumer applies, so changing one leaves the other's candidate set unchanged ([property])
- ALWAYS: a Pi session without branch metadata matches a branch search only when its recorded working directory is inside a same-product worktree root associated with that branch ([compliance])
- NEVER: a transcript is structurally parsed for a content-only selector whose needle its byte scan did not find ([compliance])
- NEVER: a selector-free search reads any transcript's full content ([compliance])
- NEVER: branch existence alone or incidental transcript content associates a Pi session with a branch ([compliance])
- ALWAYS: transcript command evidence and subagent attribution are applied only to agent transcript contracts that declare those evidence forms ([compliance])

### Audit

- ALWAYS: the supported search-agent vocabulary and adapter selection are static, typed, and exhaustive ([audit])
- ALWAYS: session-store filesystem operations and worktree association dependencies cross typed dependency-injection boundaries ([audit])
- NEVER: a store-collector filter derived from a directory name, path encoding, or any other store-layout signal decides whether a session matches a selector ([audit])
- NEVER: tests replace session-store or worktree-association boundaries through module mocking ([audit])
