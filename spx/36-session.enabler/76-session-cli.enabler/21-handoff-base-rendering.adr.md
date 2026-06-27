# Handoff-Base Refusal Rendering

The `spx session handoff` base refusal resolves its git facts in the command handler, carries them as structured fields on the thrown `SessionHandoffBaseError`, and renders the prerequisite checklist through a pure formatter whose output the descriptor writes to standard error. Fact resolution is the handler's I/O, prerequisite evaluation and checklist formatting are pure domain computation, and the stream write and exit code are the descriptor's — the layering of [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md) applied to a refusal that must report resolved git state. The behavior the checklist renders is governed by [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) and declared by [`spx/36-session.enabler/76-session-cli.enabler/session-cli.md`](session-cli.md); this decision governs only where each concern lives across the three layers.

## Rationale

A refusal that must print resolved git state follows the descriptor's diagnostic boundary: the descriptor catches domain errors and renders their diagnostics. Carrying the resolved facts on the error lets that single render path produce the checklist without the descriptor reaching for git. Descriptor-side git fact resolution duplicates handler-owned I/O, drags subprocess reads into the layer [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md) reserves for stream writes, and admits a divergence between the facts the handler classifies the base on and the facts the descriptor prints.

The handler gathers every git fact a non-main-checkout base prerequisite depends on before the resolver evaluates the prerequisites, because the checklist names every base prerequisite as `[PASS]` or `[FAIL]`. A resolution that gathers facts only for the first failing prerequisite leaves later prerequisites unevaluated, and an unevaluated prerequisite has no status mark and no resolved value to print. Evaluating every prerequisite over a complete fact set is what lets the checklist omit none.

The checklist text — the dirty-checkout headline, the numbered `[PASS]`/`[FAIL]` prerequisite marks, the resolved default branch, the `origin/<default>` tip SHA, the observed HEAD SHA, the worktree paths, the unresolved-origin wording, and each remedy — is pure computation over the carried facts. Placing it in the domain per [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md) lets the formatting verify in isolation over injected facts and reduces the descriptor to one stream write and the exit code.

## Invariants

- Every base prerequisite a non-main-checkout refusal evaluates is represented in the thrown error, independent of which prerequisites are met — the count of rendered numbered checklist lines equals the count of base prerequisites.
- A dirty working tree selects the dirty-checkout headline and never selects a remedy that offers the main checkout as an alternative to committing the dirty checkout.
- The git values the descriptor writes to standard error equal the facts the handler resolved; the descriptor resolves no git state of its own.

## Verification

### Audit

- ALWAYS: the command handler gathers every git fact the handoff-base gate evaluates — main-checkout-versus-non-main classification, branch, HEAD SHA, working-tree cleanliness, resolved default branch, `origin/<default>` tip SHA, current worktree path, and main-checkout path — and passes them as parameters to the pure resolver ([audit])
- ALWAYS: the pure resolver evaluates every non-main-checkout base prerequisite before a refusal is raised, so each prerequisite carries a pass-or-fail result regardless of an earlier prerequisite's state ([audit])
- ALWAYS: a refused handoff propagates as a thrown `SessionHandoffBaseError` carrying the resolved git facts and the per-prerequisite pass/fail evaluation as structured fields, plus the discriminant that separates a non-main-checkout refusal from a non-git refusal ([audit])
- ALWAYS: the checklist text is produced by a pure formatter over the carried facts, and the descriptor writes that text to standard error and sets the non-zero exit code ([audit])
- ALWAYS: the formatter detects an unmet clean-working-tree prerequisite from the carried checklist and emits the dirty-checkout headline before any lower-detail facts or checks ([audit])
- ALWAYS: the descriptor selects between rendering the checklist and writing nothing by the discriminant the error carries, so the non-git refusal stays silent without the descriptor inspecting git ([audit])
- ALWAYS: the resolver and formatter accept the git facts as parameters and the handler accepts a dependency-injected git runner, so each verifies over supplied values ([audit])
- NEVER: a module under `src/domains/session/` reads git state, writes to a process stream, or calls a process-exit API — git reads belong to the handler and stream writes and the exit code to the descriptor, per [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md) ([audit])
- NEVER: the descriptor recomputes a git fact to render the checklist — every value it prints originates in the error the handler raised ([audit])
- NEVER: `vi.mock()` or `jest.mock()` stands in for the git dependencies — the resolver and formatter exercise injected facts and the handler an injected runner ([audit])
