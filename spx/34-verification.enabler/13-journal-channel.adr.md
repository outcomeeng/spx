# Journal Channel

spx provides the agentic verification run-journal as a type-agnostic CLI channel. The `spx journal` verbs — `open`, `append`, `read --from <cursor>`, `seal`, `render` — operate one append-only event journal that is a run's sole source of truth, and the channel binds its streaming surface at the edge from the environment rather than from a verb or flag the caller chooses. The default surface persists to a local run-journal file under `.spx/branch/<branch-slug>/<type>/` and streams each appended event to standard output; under continuous integration on a GitHub pull request, the event journal still persists as the source of truth and each append streams by re-rendering the current projection through the GitHub Snapshot adapter into the pull-request comment. The verification kind is an opaque `<type>` scope segment the caller supplies; spx names no verification kind, and an agent — never spx — drives the channel.

## Rationale

An agentic verification run is one append-only journal per `spx/15-agent-run-journal.enabler/21-event-sourced-journal.adr.md`: every output surface is a projection rendered from the journal, and the driving skill emits through one backend-neutral channel that binds the backend at the edge — local file or hosted pull-request comment — swappable without changing the skill. spx is that channel: the agent that runs a verification skill calls these verbs, so spx records and streams a run it does not orchestrate.

The channel is type-agnostic because the only thing that distinguishes one agentic kind from another is which sub-agent the caller runs; the journal, its verbs, its backends, and its scope are identical for every kind. Carrying `audit` or `review` vocabulary into spx would couple a generic channel to specific verification kinds and force a code change for each new kind, where an opaque `<type>` scope segment costs nothing and stays open. Deterministic kinds keep their own subcommands because there spx performs the work and owns the verdict; an agentic kind has no subcommand because spx performs none of its work — it journals it.

Backend selection lives at the edge, read from the environment inside the channel, because where a run streams is a property of the invocation environment, not of the skill or the verb: a developer checkout wants a local file and standard output, a CI pull-request run wants a pull-request comment projection. A `--backend` flag threaded through every verb, or a skill that names its backend, would drift across callers and couple each to one environment. The GitHub transport that writes the pull-request comment belongs to the GitHub CI Snapshot adapter boundary; the journal command composes that injected capability and never owns GitHub API mechanics.

Rejected: per-type subcommands (`spx audit`, `spx review`) — they bake the kind into a generic channel and imply spx orchestrates the agent; a single end-of-run result instead of a streamed journal — it defeats the incremental observability that is the channel's purpose; and a caller-selected backend — it moves an environment property into skill or verb surface.

## Invariants

- The journal channel carries no verification-type identifier in its code or vocabulary; `<type>` is an opaque scope segment supplied by the caller.
- The set of verbs (`open`, `append`, `read --from <cursor>`, `seal`, `render`) is identical for every verification kind and every backend.
- Backend identity is resolved once, from the environment, inside the channel; no verb argument or skill prose selects it.
- A run's events are its sole source of truth; every rendered surface is a projection of an event prefix.

## Verification

### Audit

- ALWAYS: the journal channel resolves its backend from the environment — local file-and-standard-output by default, GitHub pull-request Snapshot-and-comment under continuous integration — never from a verb argument, a flag, or skill prose ([audit])
- ALWAYS: the verbs `open`, `append`, `read --from <cursor>`, `seal`, and `render` operate one append-only event journal bound to the agent-run-journal contract of `spx/15-agent-run-journal.enabler`, and every rendered surface is a projection of the event history ([audit])
- ALWAYS: a run's local persistence resolves under `.spx/branch/<branch-slug>/<type>/` at the Git common-dir product root per `spx/15-worktree-management.pdr.md`, with `<branch-slug>` from the state-store branch slug and `<type>` an opaque caller-supplied segment ([audit])
- ALWAYS: under the GitHub pull-request backend, an appended event persists to the run journal and streams by re-rendering the event-history projection through `spx/21-infrastructure.enabler/43-github-ci.enabler/21-snapshot-adapter.enabler` to the pull-request comment, so the run is observable on the pull request as it advances ([audit])
- NEVER: spx code references a verification-type name (`audit`, `review`) — the channel is parameterized by the opaque `<type>` scope segment ([audit])
- NEVER: spx spawns, configures, or drives a verification agent — the agent calls the channel; spx records and streams ([audit])
- NEVER: a verb argument, flag, or skill prose selects the backend — backend binding is an edge concern read from the environment ([audit])
