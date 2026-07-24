# Known Issues

## Composed terminal text carries no node-local escaping evidence

This node's terminal output path resolves each command's output to one of the two kinds [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../13-cli.enabler/15-cli-architecture.adr.md) declares: the release notes are a relayed document written byte-for-byte through the pass-through channel, and the documentation-sync line is composed spx output whose external segments are escaped where they are embedded. The node carries no co-located evidence of its own that either claim holds at its surface.

**Resolved sites:**

- `src/interfaces/cli/release.ts` — the release-notes output — agent-runner response text and CHANGELOG file content, relayed as a document
- `src/interfaces/cli/release.ts` — the documentation-sync path line — filesystem paths, composed and escaped

**Impact:** both claims rest on the primitive's own evidence under [`spx/13-cli.enabler`](../13-cli.enabler/cli.md). A later change that swaps one channel for the other — relaying a composed report, or composing the release notes and mangling the agent's own bytes — fails nothing this node owns.

**Resolution:** add this node's compliance assertion and co-located evidence that the release notes reach standard output unchanged while the documentation-sync line escapes a control-byte-bearing path. [`spx/54-diagnose.enabler`](../54-diagnose.enabler/diagnose.md) carries the composed-side shape.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.
