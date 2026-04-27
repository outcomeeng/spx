# Plan: Literal Reuse Output Modes — Remaining Steps

## Spec complete (committed)

Spec updated with: vocabulary rename (findings→problems), parseable default format, and new flags
`--kind`, `--files-with-problems`, `--literals`, `--verbose`. See `literal-reuse.md` for full
assertions.

## Step 1 — Write tests (TDD step 2)

Invoke `/typescript:testing-typescript`, then extend existing test files:

- `tests/literal.scenario.l1.test.ts` — 8 new scenarios: `--kind dupe`, `--kind reuse`,
  `--kind` with no match (exit 0 + "No problems of type X"), `--files-with-problems`,
  `--kind reuse --files-with-problems`, `--literals`, `--verbose`, `--kind reuse --json`
- `tests/literal.mapping.l1.test.ts` — 5 new mappings: `--kind` selection, default format
  layout (`[kind] "value" path:line`), `--verbose` structure (kind section → file header →
  indented lines), `--files-with-problems` format, `--literals` format (strings quoted,
  numbers decimal)
- `tests/literal.property.l1.test.ts` — 2 new properties: `--files-with-problems`
  determinism, `--literals` determinism
- `tests/literal.compliance.l1.test.ts` — 7 new compliance rules: parseable default,
  `--files-with-problems` per-line, `--literals` per-line, `--kind` cross-mode, no-match
  message, filtered exit code, `--kind` + `--json` empty-array shape

## Step 2 — Implement (TDD step 4+)

Invoke `/typescript:coding-typescript`, then update `src/commands/validation/literal.ts`:

- Add `kind?: "dupe" | "reuse"` to `LiteralCommandOptions`
- Add `filesWithProblems?: boolean`, `literals?: boolean`, `verbose?: boolean`
- Change default `formatText` to `[kind] "value" path:line` (reuse first then dupe, each
  sorted by file path then line number)
- `formatVerbose`: REUSE section → file headers → indented per-problem lines; DUPE section same
- `formatFilesWithProblems`: unique sorted file paths (no line number)
- `formatLiterals`: unique sorted values; string values double-quoted, numeric values decimal
- Apply `--kind` filter before any formatting and before JSON serialisation; set non-matching
  kind's array to `[]` in JSON output
- Exit code: when `--kind` is set, base exit on filtered problems only
- No-match message: `"Literal: No problems of type <kind>"` (exit 0) when `--kind` set and
  no matching problems

## Step 3 — Remaining from incorporated session (2026-04-25_23-58-44)

These items predate the output-mode work and remain unaddressed:

- **(A) False-positive bugs** — three classes identified empirically against real project
  output; details lost with prior session context; re-run detector against this codebase to
  reproduce, then fix
- **(B) Escape hatch** — env var + CLI flag to disable/override literal detection; originally
  scoped to `validation all`, not the `literal` subcommand; invoke
  `/contextualizing spx/41-validation.enabler/21-validation-cli.enabler` before designing

## Step 4 — Validation

`spx validation all`

## Step 5 — Commit

Invoke `/spec-tree:committing-changes`
