# Change Store

Change records expose one backend-neutral product model while each backend maps its own status labels into shared query and selection semantics. A record carries a backend-qualified handle, backend-local id, title, context, next step, maturity, product identities, product-qualified node anchors, priority, blocker handles, origin, and backend status; the worktree backend stores shared records under `.spx/changes/` at the Git common-dir product root and encodes current status and owner in the record path.

## Rationale

Backend-neutral records let agents and users refine, query, claim, and implement work without coupling the product model to a local file queue, hosted tracker, or interaction surface. Path-derived worktree status removes duplicated status fields and makes ownership unambiguous even when a worktree disappears.

## Product properties

1. Every backend exposes change records through the same product fields: `handle`, `id`, `title`, `context`, `next_step`, `maturity`, `products`, `nodes`, `priority`, `blocked_by`, `origin`, and `backend_status`.
2. Maturity is one of `intent`, `planning`, or `implementation`: `intent` carries useful perspective before ownership or implementation path is refined, `planning` carries enough product-tree context to create or update durable coordination artifacts, and `implementation` is ready for `/apply` or an equivalent governed execution workflow.
3. A change is claimable only when it is available and each `blocked_by` handle resolves to an archived change; priority orders claimable records after dependency filtering.
4. The worktree backend stores shared records under `.spx/changes/{available,running/<owner-token>,archive}/` at the Git common-dir product root, derives `backend_status` from the path, derives the current owner from the `running/<owner-token>/` path segment, and omits a frontmatter `status` field.

## Verification

### Audit

- ALWAYS: changes specs and backends expose backend-qualified handles, backend-local ids, titles, contexts, next steps, maturity, product identities, product-qualified node anchors, priorities, blocker handles, origins, and backend-owned status through the shared change-record model ([audit])
- ALWAYS: change records use only the `intent`, `planning`, and `implementation` maturity values with the semantics declared by this PDR ([audit])
- ALWAYS: exact-node and related-node queries use product-qualified node anchors, where related-node matching includes the anchored node, its ancestors, and its descendants inside the same product identity ([audit])
- ALWAYS: worktree-backed changes resolve `.spx/changes/` as shared state at the Git common-dir product root and derive status from `.spx/changes/available/`, `.spx/changes/running/<owner-token>/`, and `.spx/changes/archive/` rather than from frontmatter ([audit])
- ALWAYS: worktree-backed running changes derive their authoritative current owner from the `running/<owner-token>/` path segment while any open ownership-log entry remains diagnostic context ([audit])
- NEVER: a worktree-backed change is claimable while any `blocked_by` handle is missing, non-archived, or part of a dependency cycle ([audit])
- NEVER: a worktree-backed change record stores a frontmatter `status` field or lets an ownership log override the current owner encoded by the path ([audit])
- NEVER: session files under `.spx/sessions/` are projected into changes, read as change records, or extended with change-record fields ([audit])
