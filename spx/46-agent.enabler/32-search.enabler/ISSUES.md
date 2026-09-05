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
directory named — so a branch or content selector enumerates the whole store. A session-id
selector reads neither: it addresses its store entries directly. The remaining queries resolve
scope from that same opening directory and stay scoped to it. What each pays beyond the listing
depends on how much it decodes.

Measured on a store of 7796 transcripts totalling 6.0 GB, of which 602 transcripts and
0.57 GB fall inside the thirty-day reach window:

| Invocation                 | Store work                                  | Wall clock |
| -------------------------- | ------------------------------------------- | ---------- |
| no selector                | scoped listing, opening metadata            | ~9s        |
| `--session-id`             | addressed lookup, one probe per directory   | ~1s        |
| `--agent`                  | scoped listing, opening metadata            | ~3s        |
| `--contains`               | whole-store listing, byte-scans the window  | ~5s        |
| `--branch`                 | whole-store listing, byte-scans all history | ~28s       |
| `rg -l <branch>` for scale | one memory-mapped byte scan of 6.0 GB       | ~2.5s      |

The branch case measured ~67s before command evidence and record parsing were gated on a byte
check, and ~44s while every candidate was still decoded to text so it could be searched.
Candidacy now runs over undecoded bytes and only transcripts whose bytes carry a required
needle are decoded. The residual is CPU-bound — roughly 25s of user time in the ~28s branch
case — and is the byte search itself: Node's `Buffer.includes` is a plain byte scan with no
SIMD, and the branch case runs it twice over all history, once in the branch-evidence
collectors and once in candidate scanning. Branch evidence remains the extreme because it
reaches past the reach window by declared behavior.

A selector-free listing decodes nothing, which
[tests/scan-bound.compliance.l1.test.ts](tests/scan-bound.compliance.l1.test.ts) enforces. A
session-id selector lists no project directory, which
[tests/session-identity.compliance.l1.test.ts](tests/session-identity.compliance.l1.test.ts)
enforces. A content or branch selector decodes no transcript whose bytes lack a required
needle, which [tests/byte-scan.compliance.l1.test.ts](tests/byte-scan.compliance.l1.test.ts)
enforces. The `--contains` and `--branch` rows were measured after byte-scan candidacy landed;
the `--session-id` row after address resolution; the remaining rows predate both.

A branch search scans each candidate's bytes twice: once in the branch-evidence collectors,
which cover in-scope top-level transcripts across all history, and again in candidate
scanning over the reach window. The collectors already hold the byte verdict for every path
they visit, so handing that verdict to candidate scanning removes the second read and scan
for those paths; a moved session, which the collectors skip on its opening working directory,
still needs its own scan.

**Resolution:** carry the collectors' per-path byte verdict into candidate scanning so a
branch selector scans each transcript's bytes once. The byte search itself is the floor for a
pure-JavaScript implementation; a memory-mapped SIMD scan of the kind `rg` performs would need
native code and is out of this node's declared scope.

**Skills:** `/apply`, `/code-typescript`, `/test-typescript`.

**Revisit condition:** before the next changeset touching branch-evidence or content-selector
collection.
