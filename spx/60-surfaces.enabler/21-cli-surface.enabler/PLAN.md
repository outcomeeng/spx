# Plan: redesign the public `spx verify` surface to noun-grouped `spx verification run`

> Reconcile against `spx/PLAN.md` first. This is deferred work to run AFTER the verify
> terminal-projection slice (PR #346) merges. It is a coordination note, not product truth.

## Why

The current public `spx verify` surface is verb-first and encodes journal/storage vocabulary
(`append-scope`, `append-finding`) into the product's public CLI surface. `append` names
event-journal mechanics and belongs to the journal substrate, not the public verification-run
surface. The surface is formally compliant today, but the governance embedded an
implementation/storage vocabulary in the public product surface.

## Design direction

Replace the verb-first surface with a noun-grouped verification-run surface, GitHub-CLI style:

```
spx verification run start
spx verification run input
spx verification run scope add
spx verification run finding add
spx verification run finish
spx verification run status
spx verification run render
```

Example:

```
spx verification run finding add \
  --verification-type review --scope-type changeset --scope origin/main..HEAD \
  --run <run-token> --payload <payload-source> --idempotency-key <key>
```

- `verification` is the product-domain noun; `run` is the managed resource; `scope` and
  `finding` are resources under a run; `add` is caller intent.
- `--verification-type <type>` stays an option — the five types select a run's judgment mode;
  they are data for a run, not separate command families.
- `append` stays only in the journal surface (`spx journal append`), the event-journal surface.

## Node that carries this — and the cascade

The CLI verb grammar is owned by the surface, not the verify library
(`spx/60-surfaces.enabler/surfaces.md` L11–13; `.../21-cli-surface.enabler/cli-surface.md` L11;
`.../11-cli-surface.pdr.md` L19).

- Authoritative decision to rewrite: `spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md`
  — it currently declares the verb-first surface (`start`, `input`, `append-scope`, `append-finding`,
  `finish`, `status`, `render`) at its `### Testing` and `### Audit` rules. Rewrite it, decision-first,
  to declare the noun-grouped surface with rules equivalent to:
  - ALWAYS: typed verification-run evidence is exposed under `spx verification run`.
  - ALWAYS: verification-run evidence resources use noun groups, including `scope add` and `finding add`.
  - ALWAYS: `scope add` and `finding add` require `--payload <payload-source>` and `--idempotency-key <key>`.
  - ALWAYS: `spx verification run scope --help` and `... finding --help` describe their noun-local verbs.
  - NEVER: public verification-run verbs expose journal mechanics such as `append-scope`, `append-finding`, `event`, or `journal`.
  - NEVER: a top-level verb command such as `spx verify` manages verification runs.
- First affected lower specs to align via `/apply`: the verify library
  `spx/34-verification.enabler/32-verify.enabler` — `verify.md` verb-mapping (its opening + Mappings),
  `32-evidence-append.enabler/evidence-append.md` (`append-scope`/`append-finding` names), and the
  `21-run-context.enabler` / `43-terminal-projection.enabler` verb references. The clean split leaves
  the library on interface-neutral operation semantics and the surface PDR on CLI spelling.
- Implementation: `src/interfaces/cli/verify.ts` (Commander descriptor), `src/commands/verify/cli.ts`,
  per `spx/14-cli-composition.adr.md` and `spx/13-cli.enabler/15-cli-architecture.adr.md`.

## PR #346 review findings this refactor subsumes

These verify-command-surface findings are tracked (not deep-fixed) in #346 because the refactor
rewrites `verifyFinishCommand` and the append/finish verbs:

- The `finish` idempotent-branch seal-retry gap — a first `finish` whose seal write fails leaves the
  physical `metadata.sealed` marker false forever, excluding the run from `journal read-set --sealed`.
  Tracked in `spx/34-verification.enabler/32-verify.enabler/ISSUES.md`; the `finish` rewrite here should
  converge the physical seal marker on retry.

- The selector option-placement mismatch (`src/interfaces/cli/verify.ts`) — the documented surface
  places the `--verification-type`/`--scope-type`/`--scope`/`--run` selectors before the verb
  (`13-verify-command-surface.pdr.md`, `verify.md`, and the node scenarios all write
  `spx verify --verification-type … <verb>`), but every verb registers those selectors on its own
  subcommand, so Commander parses them only after the verb (`spx verify <verb> --verification-type …`).
  This spans all seven verbs, not just the terminal-projection slice, so its resolution is the coherent
  surface redefinition this refactor performs: the noun-grouped `spx verification run <verb>` grammar
  fixes the invocation shape, and the refactor adds the L2 CLI test that exercises the actual ordering
  (the L1 handler tests bypass Commander parsing, so no current test covers the option placement).
  Surfaced by codex on PR #346.

## Constraints

- Decision-first PDR rewrite, audited by `pdr-auditor`, then `/apply` for the cascade.
- No backward-compat aliases for `spx verify append-scope`/`append-finding` — this repo does not
  preserve compatibility during rewrites.
- CLI-surface change → triggers the CLAUDE.md post-merge release sequence.

## Source

Operator-supplied design note; SPX surface governance (`surfaces.md`, `cli-surface.md`,
`11-cli-surface.pdr.md`, `13-verify-command-surface.pdr.md`, `spx/14-cli-composition.adr.md`,
`spx/13-cli.enabler/15-cli-architecture.adr.md`); GitHub CLI noun-first manual (`gh pr`, `gh run`, `gh workflow`).
