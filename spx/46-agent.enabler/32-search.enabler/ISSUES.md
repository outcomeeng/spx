# Known Issues

## External values reach the terminal without control-byte escaping

This node's terminal output path passes values that originated outside the product's own source straight to the process streams. [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../13-cli.enabler/15-cli-architecture.adr.md) makes escaping a property of the composed value: an externally-originated segment is escaped where it is embedded, through the `src/lib/terminal-text/` primitive, while product-authored segments keep their bytes so styling and line structure survive. This node predates that invariant and has not migrated to it.

**Unescaped sites:**

- `src/interfaces/cli/agent.ts` — the search listing output — transcript content matched from agent session files

**Impact:** a value carrying an escape byte (`0x1b`) can reposition the cursor, recolor the terminal, or clear the screen; a value carrying a line feed can forge an additional diagnostic line that reads as if spx emitted it. Whoever controls the named origins controls those bytes.

**Resolution:** compose this node's terminal-destined text through `src/lib/terminal-text/`, declaring each interpolated value authored or external at the point of composition; then add the node's own compliance assertion and co-located evidence that a control-byte-bearing value renders escaped. [`spx/54-diagnose.enabler`](../../54-diagnose.enabler/diagnose.md) carries the migrated shape and its evidence.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.

## Selector search cost exceeds the product-level command bound

`spx.product.md` asserts every CLI command completes in under 100ms once the CLI process is
running. Search over a large Claude Code store does not.

A selector read from recorded content cannot be narrowed by the store-directory name — a
session that moved into the product is filed under the directory its opening working
directory named — so a branch or content selector enumerates the whole store. Every other
query resolves scope from that same opening directory and stays scoped to it. What each pays
beyond the listing depends on how much it decodes.

Measured on a store of 7796 transcripts totalling 6.0 GB, of which 602 transcripts and
0.57 GB fall inside the thirty-day reach window:

| Invocation                 | Store work                                    | Wall clock |
| -------------------------- | --------------------------------------------- | ---------- |
| no selector                | scoped listing, opening metadata              | ~9s        |
| `--session-id` / `--agent` | scoped listing, opening metadata              | ~3s        |
| `--contains`               | whole-store listing, decodes the reach window | ~11s       |
| `--branch`                 | whole-store listing, decodes all history      | ~44s       |
| `rg -l <branch>` for scale | one memory-mapped byte scan of 6.0 GB         | ~2.5s      |

The branch case measured ~67s before command evidence and record parsing were gated on a byte
check. The residual cost is decoding transcript bytes into JavaScript strings; gating the
structured parses removed the JSON-parse share and the decode share remains. Branch evidence
is the extreme because it reaches past the reach window by declared behavior, so it decodes
all history rather than the window.

A selector-free listing decodes nothing, which
[tests/scan-bound.compliance.l1.test.ts](tests/scan-bound.compliance.l1.test.ts) enforces.

**Resolution:** locate the needle without decoding the whole transcript — scan the raw
buffer and decode only transcripts that hit. The two-pass scan named in
[PLAN.md](PLAN.md) is the same work.

**Skills:** `/apply`, `/code-typescript`, `/test-typescript`.

**Revisit condition:** before the next changeset touching branch-evidence or content-selector
collection.
