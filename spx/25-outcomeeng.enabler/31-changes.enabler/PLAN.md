# PLAN

## Backend-neutral changes and git-native session files

### Purpose

SPX needs a first-class Outcome Engineering change model that preserves useful intake from users and agents even when the author has limited product-architecture context. A local session file can project or serialize that model, but the session file storage contract remains governed by `spx/36-session.enabler` until a later product decision rewrites it.

The change model lets an agent record valuable intent, refine it into durable spec-tree coordination, and later execute it through governed workflows. The same model can be exposed through the SPX CLI, git-native local files, Linear, Jira, GitHub Issues, or another backend.

### Product model

A change record carries:

- `id`: backend-scoped identifier.
- `title` or `goal`: concise statement of the desired change.
- `context`: human-authored background, observation, or rationale.
- `next_step`: the first useful action for the receiving user or agent.
- `maturity`: `intent`, `planning`, or `implementation`.
- `nodes`: full `spx/...` node anchors for exact and related-node queries.
- `priority`: queue ordering.
- `origin`: source of the change, such as agent observation, user request, workflow failure, review, or external tracker.
- `related_repositories`: repositories or products relevant to the change.
- `backend_status`: backend-owned queue state, mapped into common query semantics.

Maturity means:

- `intent`: useful perspective exists, while ownership, architecture, or implementation path remains under-refined.
- `planning`: the change has enough product-tree context to create or update specs, `PLAN.md`, `ISSUES.md`, or decision records.
- `implementation`: the change is ready for `/apply` or an equivalent governed execution workflow.

### Hierarchy direction

Introduce the Outcome Engineering capability layer before moving surfaces:

```text
spx/25-outcomeeng.enabler/
  31-changes.enabler/
    29-changes-worktree.enabler/

spx/45-cli.surface/
  28-changes-cli.surface/
  36-session-cli.surface/
```

`spx/25-outcomeeng.enabler/31-changes.enabler` owns the backend-neutral model:

- change-record schema
- maturity lifecycle
- node anchors and related-node matching
- refinement semantics
- backend-neutral query predicates
- backend capability expectations

`spx/25-outcomeeng.enabler/31-changes.enabler/29-changes-worktree.enabler` owns the git-native, worktree-aware backend:

- local markdown/YAML representation
- compatibility with existing `.spx/sessions/` files without changing their Git-common-dir shared-state semantics
- queue directories or their successor layout
- claim, release, archive, and retention semantics for local files
- migration from current session records

`spx/45-cli.surface/28-changes-cli.surface` owns CLI exposure:

- `spx change list`
- `spx change show`
- `spx change refine`
- `spx change pick`
- `--maturity`, `--node`, and `--related` filters
- text and JSON output

`spx/45-cli.surface/36-session-cli.surface` preserves agent-handoff compatibility while session commands consume change-record projections. Session commands keep `.spx/sessions/` shared across repository worktrees unless a later session-storage PDR changes that contract.

### Node-type direction

The current enabler/outcome split does not distinguish invisible capability from exported interaction boundary. Add `surface` as a node type only after the filename grammar, kind registry, and naming-schema version accept the new suffix:

- `enabler`: invisible substrate consumed by other nodes, including human-developer and agent-developer consumers.
- `surface`: exported API or exposed interaction surface, such as a CLI command family, library API, file protocol, agent-facing command, hosted API, or plugin contract.
- `outcome`: a potentially ephemeral bet implemented by one or more potentially ephemeral `.surface` children. Durable substrate sits in lower-index enabler parents.

After the grammar and naming-schema change, this separates backend-neutral libraries from user-facing surfaces:

- `spx/23-spec-tree.enabler` remains the spec-tree data-structure library.
- `spx/31-spec-domain.enabler` moves or is reframed as a surface over that library.
- `spx/25-outcomeeng.enabler/31-changes.enabler` owns the backend-neutral changes model.
- `spx/45-cli.surface/28-changes-cli.surface` exposes change operations through the CLI.

### Session-file lifecycle

Existing session files remain shared session-state files under `.spx/sessions/` at the Git common-dir product root per `spx/15-worktree-management.pdr.md` and `spx/36-session.enabler/11-session-frontmatter.pdr.md`. They can carry a change-record projection and refinement fields while keeping agent handoff visible from every worktree:

- `intent` files capture observations and desired changes when the author has partial architecture context.
- `planning` files guide durable coordination work, including spec edits, `PLAN.md`, `ISSUES.md`, and decision records.
- `implementation` files point receiving agents at a governed execution workflow such as `/apply`.

This supports cases where an agent working in this product sees a needed update in the plugins repository. The agent can write a change record with useful context even when it cannot create coordination notes in the target repository from the current product workflow.

### Query experience

Changes must be queryable by structured product fields:

```bash
spx change list --maturity intent
spx change list --node spx/25-outcomeeng.enabler/31-changes.enabler
spx change list --related spx/36-session.enabler
spx change show <id> --json
spx change refine <id> --maturity planning --node spx/25-outcomeeng.enabler/31-changes.enabler
spx change pick --maturity implementation
```

Compatibility surfaces keep current agent flows available:

```bash
spx session list --maturity intent
spx session list --node spx/25-outcomeeng.enabler/31-changes.enabler
spx session pick --related spx/36-session.enabler
```

Exact node matching selects records whose `nodes` include the supplied node. Related matching selects records whose `nodes` include the supplied node, an ancestor of it, or a descendant of it.

### Decision placement

Product decisions move to the smallest node whose product behavior they govern:

- Backend-neutral change behavior belongs under `spx/25-outcomeeng.enabler/31-changes.enabler`.
- Worktree file behavior belongs under `spx/25-outcomeeng.enabler/31-changes.enabler/29-changes-worktree.enabler`.
- CLI command behavior belongs under `spx/45-cli.surface/28-changes-cli.surface`.
- Agent-handoff compatibility behavior belongs under `spx/45-cli.surface/36-session-cli.surface`.

Architecture decisions move to the owning enabler or surface. Root-level ADRs should disappear as owner nodes become available.

### First implementation slice after this catalyst

1. Update the spec-tree filename grammar, kind registry, validation model, and naming-schema version so `.surface` is a recognized canonical node suffix.
2. Add the `surface` node type to the spec-tree methodology after the grammar can recognize it.
3. Create `spx/25-outcomeeng.enabler/31-changes.enabler/29-changes-worktree.enabler`.
4. Create `spx/45-cli.surface/28-changes-cli.surface`.
5. Preserve `.spx/sessions/` as shared Git-common-dir session state while adding change-record projections to current session records.
6. Move session frontmatter/schema ownership only after the worktree changes backend and session-storage PDR agree on the shared-state contract.
7. Add `maturity` and `nodes` to the local change/session-file representation.
8. Expose `maturity`, `nodes`, exact-node queries, and related-node queries in JSON and text surfaces.

### Open structure questions

- Whether `spx/36-session.enabler` remains as a temporary compatibility enabler or moves entirely under `spx/45-cli.surface/36-session-cli.surface`.
- Whether `spx/31-spec-domain.enabler` moves under `spx/45-cli.surface` in the same node-type migration or in a later slice.
- Whether the git-native changes backend stores records under a new `.spx/changes/` shared-state layout, projects existing `.spx/sessions/{todo,doing,archive}/` records, or introduces both with an explicit compatibility reader.
