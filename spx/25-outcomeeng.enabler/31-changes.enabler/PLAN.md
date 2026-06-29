# PLAN

## Backend-neutral changes and surfaces

### Purpose

SPX needs a first-class Outcome Engineering change model that preserves useful intake from users and agents even when the author has limited product-architecture context. The change model is a new product domain rather than a compatibility layer over current session files.

The change model lets an agent record valuable intent, refine it into durable spec-tree coordination, and later execute it through governed workflows. The same model can be exposed through the SPX CLI, git-native local files, Linear, Jira, GitHub Issues, or another backend.

### Product model

A change record carries:

- `handle`: stable backend-qualified identifier, such as `worktree:2026-06-29_12-00-00-000-abcd1234` or `linear:ENG-123`.
- `id`: backend-local identifier, valid only with its backend qualifier.
- `title`: concise statement of the desired change.
- `context`: human-authored background, observation, or rationale.
- `next_step`: the first useful action for the receiving user or agent.
- `maturity`: `intent`, `planning`, or `implementation`.
- `products`: repository or product identities the change concerns, such as `outcomeeng/spx` or the plugins repository.
- `nodes`: product-qualified `spx/...` node anchors for exact and related-node queries.
- `priority`: queue ordering.
- `origin`: source of the change, such as agent observation, user request, workflow failure, review, or external tracker.
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
```

`spx/25-outcomeeng.enabler/31-changes.enabler` owns the backend-neutral model:

- change-record schema
- maturity lifecycle
- backend-qualified handles
- product-qualified node anchors and related-node matching
- refinement semantics
- backend-neutral query predicates
- backend capability expectations

`spx/25-outcomeeng.enabler/31-changes.enabler/29-changes-worktree.enabler` owns the git-native, worktree-aware backend:

- local markdown/YAML representation
- `.spx/changes/` or another change-owned shared-state layout
- claim, release, archive, and retention semantics for local files

`spx/45-cli.surface/28-changes-cli.surface` owns CLI exposure:

- `spx change list`
- `spx change show`
- `spx change refine`
- `spx change pick`
- `--maturity`, `--node`, and `--related` filters
- text and JSON output

### Node-type direction

The current enabler/outcome split does not distinguish invisible capability from exported interaction boundary. The `surface` concept changes methodology vocabulary for the whole tree, so it needs a methodology-level plan and PDR path before implementation starts. Add `surface` as a node type only after that methodology path is written and the filename grammar, kind registry, and naming-schema version accept the new suffix:

- `enabler`: invisible substrate consumed by other nodes, including human-developer and agent-developer consumers.
- `surface`: exported API or exposed interaction surface, such as a CLI command family, library API, file protocol, agent-facing command, hosted API, or plugin contract.
- `outcome`: a potentially ephemeral bet implemented by one or more potentially ephemeral `.surface` children. Durable substrate sits in lower-index enabler parents.

After the grammar and naming-schema change, this separates backend-neutral libraries from user-facing surfaces:

- `spx/23-spec-tree.enabler` remains the spec-tree data-structure library.
- `spx/31-spec-domain.enabler` moves or is reframed as a surface over that library.
- `spx/25-outcomeeng.enabler/31-changes.enabler` owns the backend-neutral changes model.
- `spx/45-cli.surface/28-changes-cli.surface` exposes change operations through the CLI.

### Boundary with sessions

Current session files remain governed by `spx/36-session.enabler` until that domain is retired or rewritten by its own product decision. The changes domain does not project into `.spx/sessions/`, read session records as changes, add change fields to session files, or expose session commands as compatibility aliases.

This still supports cases where an agent working in this product sees a needed update in the plugins repository. The agent writes a change record in the changes backend with product-qualified anchors and useful context, even when it cannot create coordination notes in the target repository from the current product workflow.

### Query experience

Changes must be queryable by structured product fields:

```bash
spx change list --maturity intent
spx change list --product outcomeeng/spx --node spx/25-outcomeeng.enabler/31-changes.enabler
spx change list --product outcomeeng/spx --related spx/36-session.enabler
spx change show worktree:2026-06-29_12-00-00-000-abcd1234 --json
spx change refine worktree:2026-06-29_12-00-00-000-abcd1234 --maturity planning --product outcomeeng/spx --node spx/25-outcomeeng.enabler/31-changes.enabler
spx change pick --maturity implementation
```

Exact node matching selects records whose product-qualified `nodes` include the supplied product and node. Related matching selects records whose product-qualified `nodes` include the supplied node, an ancestor of it, or a descendant of it inside the same product identity.

### Decision placement

Product decisions move to the smallest node whose product behavior they govern:

- Backend-neutral change behavior belongs under `spx/25-outcomeeng.enabler/31-changes.enabler`.
- Worktree file behavior belongs under `spx/25-outcomeeng.enabler/31-changes.enabler/29-changes-worktree.enabler`.
- CLI command behavior belongs under `spx/45-cli.surface/28-changes-cli.surface`.

Architecture decisions move to the owning enabler or surface. Root-level ADRs should disappear as owner nodes become available.

### First implementation slice after this catalyst

1. Promote `surface` into the methodology-level planning and PDR path for the whole tree, including the future placement of `spx/31-spec-domain.enabler`.
2. Update the spec-tree filename grammar, kind registry, validation model, and naming-schema version so `.surface` is a recognized canonical node suffix.
3. Add the `surface` node type to the spec-tree methodology after the grammar can recognize it.
4. Create `spx/25-outcomeeng.enabler/31-changes.enabler/29-changes-worktree.enabler`.
5. Create `spx/45-cli.surface/28-changes-cli.surface`.
6. Define backend-qualified change handles and product-qualified node anchors.
7. Add `maturity`, `backend_status`, and product-qualified `nodes` to the local change representation.
8. Expose `maturity`, `backend_status`, product-qualified exact-node queries, and product-qualified related-node queries in JSON and text surfaces.

### Open structure questions

- Whether `spx/31-spec-domain.enabler` moves under `spx/45-cli.surface` in the same node-type migration or in a later slice.
- Whether `spx/36-session.enabler` remains independently governed until pruned, or is rewritten after changes exist.
- Whether the git-native changes backend stores records under `.spx/changes/` or another change-owned shared-state layout.
