# Known Issues

## External values reach the terminal without control-byte escaping

This node's terminal output path passes values that originated outside the product's own source straight to the process streams. [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../13-cli.enabler/15-cli-architecture.adr.md) makes escaping a property of the composed value: an externally-originated segment is escaped where it is embedded, through the `src/lib/terminal-text/` primitive, while product-authored segments keep their bytes so styling and line structure survive. This node predates that invariant and has not migrated to it.

**Unescaped sites:**

- `src/interfaces/cli/agent.ts` — the search listing output — transcript content matched from agent session files

**Impact:** a value carrying an escape byte (`0x1b`) can reposition the cursor, recolor the terminal, or clear the screen; a value carrying a line feed can forge an additional diagnostic line that reads as if spx emitted it. Whoever controls the named origins controls those bytes.

**Resolution:** compose this node's terminal-destined text through `src/lib/terminal-text/`, declaring each interpolated value authored or external at the point of composition; then add the node's own compliance assertion and co-located evidence that a control-byte-bearing value renders escaped. [`spx/54-diagnose.enabler`](../../54-diagnose.enabler/diagnose.md) carries the migrated shape and its evidence.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.

## Branch search cost exceeds the product-level command bound

`spx.product.md` asserts every CLI command completes in under 100ms once the CLI process is
running. A branch-associated search over a large Claude Code store does not.

Measured on a store of 7796 transcripts totalling 6.0 GB, searching one branch across the
whole store:

| Stage                                                            | Wall clock |
| ---------------------------------------------------------------- | ---------- |
| Before per-record association                                    | ~67s       |
| After gating command evidence and record parsing on a byte check | ~45s       |
| `rg -l <branch>` over the same bytes                             | ~2.5s      |

The residual cost is decoding transcript bytes into JavaScript strings: branch evidence
reaches the whole store by declared behavior, so every candidate transcript is read in full
and decoded as UTF-8 before any needle check. Gating the structured parses removed the
JSON-parse share; the decode share remains.

**Resolution:** locate the needle without decoding the whole transcript — scan the raw
buffer and decode only transcripts that hit. The two-pass scan named in
[PLAN.md](PLAN.md) is the same work.

**Skills:** `/apply`, `/code-typescript`, `/test-typescript`.

**Revisit condition:** before the next changeset touching branch-evidence collection.
