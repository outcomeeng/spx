# Known Issues

## External values reach the terminal without control-byte escaping

This node's terminal output path passes values that originated outside the product's own source straight to the process streams. [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../13-cli.enabler/15-cli-architecture.adr.md) makes escaping a property of the composed value: an externally-originated segment is escaped where it is embedded, through the `src/lib/terminal-text/` primitive, while product-authored segments keep their bytes so styling and line structure survive. This node's command-line path composes through that primitive; its interactive picker does not.

**Composed sites:**

- `src/interfaces/cli/agent.ts` — the resume listing output and the error branches — agent transcript JSONL fields, working-directory paths, and branch names

**Remaining sites:**

- `src/interfaces/cli/agent/resume/AgentResumePicker.tsx` — the candidate row — the transcript session identifier and working directory, rendered into an Ink component tree rather than written to a process stream

**Impact:** a value carrying an escape byte (`0x1b`) can reposition the cursor, recolor the terminal, or clear the screen; a value carrying a line feed can forge an additional row that reads as if spx emitted it. Whoever writes an agent transcript controls those bytes.

**Blocked by:** the composition primitive addresses text written to a process stream. An Ink component renders through the React reconciler under [`spx/13-cli.enabler/21-terminal-ui.adr.md`](../../13-cli.enabler/21-terminal-ui.adr.md), so the escaping decision has to reach the value before it becomes a rendered node, and the interactive surface has no equivalent boundary yet.

**Resolution:** establish where an interactive interface escapes an externally-originated value — at the row model under `src/domains/`, which the terminal-interface decision already requires to be pure computation — then add this node's compliance assertion and co-located evidence over the rendered buffer.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.
