# Local Change draft prototype

Implement the operator-approved local draft capability and its CLI, with coordination/change audit classification under `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler`.

## Structure

The changes node is the current holding path for Change semantics. Draft persistence is a capability; its create/list/delete contract is interface behavior; command grammar is surface behavior. Configured target-kind migration remains governed by `spx/PLAN.md`; this change uses supported enabler suffixes.

The first-half composition horizon contains the governing Change-store PDR at 21, draft architecture at 26, local draft capability at 32, and CLI consumer at 43. The architecture consumes the PDR's draft/backend distinction. The draft capability consumes those decisions; the CLI consumes the draft operations and descriptors. Later independent Change capabilities remain unassigned.

## Activities

1. Finish the focused deterministic checks for draft storage, CLI behavior, and coordination/change audit evidence and projection. Invalid-command cases retain separate test envelopes and their declared generated run counts.
2. Converge the affected evidence, implementation, and changeset gates on a clean committed subject. The preimplementation evidence audits reported absent behavior; the CLI audit also required specific diagnostic assertions and registry-enumerated operation coverage.
3. Merge through `/merge` and release the CLI capability before the separate plugin consumer enables the commands.

The separate plugins Product consumes the released commands in its agreed eight-file Change skill prototype. This SPX change creates no hosted Change backend, canonical `.spx/changes/` store, session migration, eval, or Python implementation script.

Publication keeps unfinished drafts and intermediate audit output separate from the shared Change. Audit evidence may use local or private hosted storage through environment-configured verification backends. This change adds no confidentiality gate or access-control capability; ordinary file-safety checks still protect draft operations against overwrite and path escape.
