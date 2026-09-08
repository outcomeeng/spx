# Known Issues

## External values reach the terminal without control-byte escaping

This node's terminal output path passes values that originated outside the product's own source straight to the process streams. [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../13-cli.enabler/15-cli-architecture.adr.md) makes escaping a property of the composed value: an externally-originated segment is escaped where it is embedded, through the `src/lib/terminal-text/` primitive, while product-authored segments keep their bytes so styling and line structure survive. This node predates that invariant and has not migrated to it.

**Unescaped sites:**

- `src/interfaces/cli/agent.ts` — the search listing output — transcript content matched from agent session files

**Impact:** a value carrying an escape byte (`0x1b`) can reposition the cursor, recolor the terminal, or clear the screen; a value carrying a line feed can forge an additional diagnostic line that reads as if spx emitted it. Whoever controls the named origins controls those bytes.

**Resolution:** compose this node's terminal-destined text through `src/lib/terminal-text/`, declaring each interpolated value authored or external at the point of composition; then add the node's own compliance assertion and co-located evidence that a control-byte-bearing value renders escaped. [`spx/54-diagnose.enabler`](../../54-diagnose.enabler/diagnose.md) carries the migrated shape and its evidence.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.

## Located transcripts are parsed line by line, twice for a branch query

Candidacy comes from the native locator, so a selector reads no transcript past its head that
the locator did not name. The cost that remains scales with the located transcripts: a
content or branch needle names every transcript that mentions it, and each named transcript
is read whole and parsed row by row — once for its recorded working directories and branches,
and again for accepted branch commands when the selector is a branch.

Measured on a 12-core host at a load average of 22 over the same store as the earlier
byte-scan measurements (7,796 transcripts, 6.0 GB), comparing the released in-process search
with the locator-backed search on identical queries:

| Invocation                  | Released | Locator | Rows | Identical rows |
| --------------------------- | -------- | ------- | ---- | -------------- |
| `--branch work/chat-...`    | 76.3s    | 18.6s   | 0    | yes            |
| `--contains work/chat-...`  | 14.4s    | 15.7s   | 3    | yes            |
| `--session-id 080e9a4e-...` | 4.8s     | 9.0s    | 1    | yes            |

Under that load the locator names the 87 transcripts carrying the branch literal (121 MB,
the largest 29 MB) in 3.0s, process startup takes 2.1s, and the selector-free listing with
its head reads takes 2.6s. The rest of each locator-backed invocation is the whole-text read
and row-by-row JSON parse of the located transcripts, which the released search paid
identically for the same transcripts after its byte scan. The session-id query costs more
than the released store-address probe because it now reads and parses every transcript that
mentions the id rather than probing one path per project directory; that trade is recorded
in [`21-search-adapters.adr.md`](21-search-adapters.adr.md).

**Impact:** a needle carried by many large transcripts still costs seconds of CPU after the
locator has answered, and a branch query parses each located transcript twice.

**Resolution:** parse each located transcript once, deriving recorded positions and command
evidence from the same row pass, and bound the row parse to the rows a selector can use.

**Skills:** `/apply`, `/code-typescript`.

**Revisit condition:** before the next changeset touching transcript record or command
evidence parsing.
