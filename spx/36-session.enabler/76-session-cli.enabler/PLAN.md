# PLAN

## Plan A — Uplift the non-interactive `spx session list` text output

### Why this plan exists

The interactive picker `spx session pick` shipped (Ink, `spx/36-session.enabler/87-session-pick.enabler`). The original request had a second half that was scoped out into this separate slice: the **non-interactive** `spx session list` (and `spx session todo`) text output is a flat, uncolored, untruncated dump and should read better in a terminal. This slice does **not** touch the interactive picker and does **not** use Ink — it is a plain string-formatter change.

### Current state (verify before starting)

- `src/commands/session/list.ts` → `formatTextOutput(sessions)` renders each session as one line: `{id}{ [priority]}{ {goal} -> {next_step}}`. The summary (`goal -> next_step`) is appended only when both are non-empty; the priority badge is shown only when the priority is not the default. Output is uncolored and never truncated, so long goals wrap and the columns do not align.
- `listCommand(options)` in the same file builds the text via `lines.push(`${status.toUpperCase()}:`)` then `formatTextOutput(...)`. The `--json`/`--fields` path is separate and must stay byte-for-byte unchanged.
- `chalk@^5` is a **declared-but-unused** dependency (`package.json` dependencies; `grep -rn "chalk" src` returns nothing). Using it here also clears the unused-dependency smell.
- The descriptor `src/interfaces/cli/session.ts` registers `list` and `todo`; both currently pass `format` and print with `console.log`.

### Architecture constraints (ADR `spx/14-cli-composition.adr.md`)

- The pure formatter stays in the **domain/handler layer** and returns a string. Applying ANSI color is pure string transformation, so it may live in the pure formatter — but **TTY detection is process I/O** and belongs in the **descriptor** (`src/interfaces/cli/session.ts`).
- Therefore: thread a `color: boolean` (and `width: number` if truncating to terminal width) **into** the formatter as a parameter. The descriptor computes it and passes it down. Never let the formatter read `process.stdout.isTTY` or `process.env` itself.
- chalk auto-detects color support from the environment; that detection is itself environment I/O. **Force chalk's level from the passed flag** (e.g. construct a `new chalk.Chalk({ level: color ? N : 0 })` instance, or gate every colorizing call behind the boolean) so the pure formatter's output is a deterministic function of its inputs.

### Target behavior

- **Color (TTY only):** status headers (`DOING:` / `TODO:`) colorized; priority color-coded — high = red, medium = yellow, low = dim/gray (derive the priority set from `SESSION_PRIORITY`, never hardcode the strings, per `spx/36-session.enabler/21-directory-structure.adr.md`'s sibling convention); timestamp ID dimmed.
- **Truncation:** truncate the goal to the terminal width; render `next_step` on a dim continuation line, or omit it in a compact mode. Keep it readable at 80 columns.
- **Pipe-safe:** when stdout is **not** a TTY (piped, CI), emit **plain** output (no ANSI), so `spx session list | …` and downstream parsing stay intact. Honor `NO_COLOR` (https://no-color.org) and add `--color`/`--no-color` flags that override TTY detection.
- **`--json`/`--fields` unchanged:** the JSON path must not gain color or truncation. The empty-state text (`SESSION_LIST_EMPTY_TEXT`) stays.

### Work breakdown (follow the spec-tree flow)

1. `/understanding`, then `/contextualizing spx/36-session.enabler/76-session-cli.enabler`.
2. `/authoring` — add assertions to `session-cli.md` for the new text-output behavior. Likely shapes: a compliance/scenario `[test]` that the formatter emits ANSI when `color=true` and plain when `color=false`; a property `[test]` that truncation never exceeds the given width; a compliance `[test]` (l2, built executable) that a piped (non-TTY) `spx session list` writes no ANSI escapes. Route assertion types through `/testing`.
3. `/applying` — TDD: tests first (pure formatter is `[test]` l1; non-TTY-no-color is `[test]` l2 via `node bin/spx.js` with piped stdio, mirroring `spx/36-session.enabler/87-session-pick.enabler/tests/picker-cli.compliance.l2.test.ts`), then implementation, then the audit gates (`typescript:auditing-typescript-tests`, `typescript:auditing-typescript`).
4. `pnpm run validate` + targeted tests, then `/merge`.

### Files to touch

- `src/commands/session/list.ts` — `formatTextOutput` gains `color`/`width` params; `ListOptions` gains a resolved color decision (or the descriptor passes it).
- `src/interfaces/cli/session.ts` — `list` and `todo` descriptors: compute `color` from `process.stdout.isTTY`, `NO_COLOR`, and `--color`/`--no-color`; pass terminal width; add the two flags.
- `package.json` — no change needed; chalk is already declared (do not `pnpm add` it again).

### Out of scope

- The interactive picker (`87-session-pick.enabler`) — already shipped.
- Any change to the `--json`/`--fields` projection.
