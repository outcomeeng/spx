# Known Issues

## External values reach the terminal without control-byte escaping

This node's terminal output path passes values that originated outside the product's own source straight to the process streams. [spx/13-cli.enabler/15-cli-architecture.adr.md](spx/13-cli.enabler/15-cli-architecture.adr.md) makes escaping a property of the composed value: an externally-originated segment is escaped where it is embedded, through the `src/lib/terminal-text/` primitive, while product-authored segments keep their bytes so styling and line structure survive. This node predates that invariant and has not migrated to it.

**Unescaped sites:**

- `src/interfaces/cli/agent.ts` — the resume listing output — agent transcript JSONL fields, working-directory paths, and branch names
- `src/interfaces/cli/agent/resume/AgentResumePicker.tsx` — the candidate row — the transcript session identifier and working directory

**Impact:** a value carrying an escape byte (`0x1b`) can reposition the cursor, recolor the terminal, or clear the screen; a value carrying a line feed can forge an additional diagnostic line that reads as if spx emitted it. Whoever controls the named origins controls those bytes.

**Resolution:** compose this node's terminal-destined text through `src/lib/terminal-text/`, declaring each interpolated value authored or external at the point of composition; then add the node's own compliance assertion and co-located evidence that a control-byte-bearing value renders escaped. [spx/54-diagnose.enabler](spx/54-diagnose.enabler/diagnose.md) carries the migrated shape and its evidence.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.

## Pass/fail predicates sit in harnesses instead of the linked test files

Test evidence for this node's assertions places the pass/fail predicate in a harness while the linked test file only invokes it, so the assertion-seam rule (predicate ownership) is unmet. A reader of a linked test file cannot see what the test asserts.

**Harness-owned predicates:**

- `testing/harnesses/agent/resume.ts` — the harness functions own the `expect` calls for the recent-session window (stale and future modified sessions), explicit-since filtering and read bounds, one-time scope-reference resolution, the bounded metadata head and activity tail windows, session-id deduplication, Codex interactive versus exec and subagent transcripts, and Claude Code subagent transcripts; the linked callbacks in `spx/46-agent.enabler/21-resume.enabler/tests/resume.compliance.l1.test.ts` only await them
- `testing/harnesses/agent/resume-mapping.ts` — the `describe` and `it` blocks and their `expect` calls live in the harness, and `spx/46-agent.enabler/21-resume.enabler/tests/resume.mapping.l1.test.ts` is a one-line side-effect import; this covers the resume mode mapping, the scope-by-mode composition, the activity-window mapping, and the conflicting-flags diagnostic
- `testing/harnesses/agent/resume-cli-compliance.ts` — the non-TTY diagnostic assertion lives in the harness, and `spx/46-agent.enabler/21-resume.enabler/tests/resume-cli.compliance.l1.test.ts` is a one-line side-effect import

**Impact:** inverting any of those clauses changes test infrastructure instead of the linked test, so a reader of the test file cannot see the predicate and the audit cannot attribute the verdict to the test.

**Settlement condition:** the pass/fail predicates for the listed assertions are `expect` calls in the linked test files, and the harnesses return observations only.
