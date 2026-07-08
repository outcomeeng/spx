# PLAN

Local quality-enforcement decision (`spx/21-infrastructure.enabler/43-code-quality-analysis.enabler/15-local-quality-enforcement.adr.md`), sequenced across the `SonarQube zero-issues` session queue (`spx session todo`).

## Landed (session 01)

- Type-aware lint mirror: `parserOptions.projectService` plus a curated SonarJS and `@typescript-eslint` rule set in `eslint-rules/offline-mirror.ts`, composed into `buildEslintConfig` and scoped to the tsconfig-covered trees, run warn-first so validation stays green over the existing backlog. `eslint-plugin-sonarjs` added.

## Landed (session 06)

- Unicorn-family mirror: `eslint-plugin-unicorn` (65.0.1, for ESLint 9 peer compatibility) added to `eslint-rules/offline-mirror.ts` with `prefer-node-protocol`, `prefer-code-point`, `prefer-single-call`, and `prefer-string-raw` at the warn tier (backlog uncleared), plus the `unicorn` plugin registered in the mirror config block. The compliance test proves each unicorn rule flags a violating fixture and sits in the warn tier.
- The unicorn classes graduate to the error tier in whatever change clears their last occurrence. A cross-cutting unicorn sweep would touch files carrying unrelated findings, so the clearing distributes across each session's touched-file collateral instead.

## Landed (session 08)

- S3776 (cognitive complexity above the SonarQube threshold) is clear in the linted tree, and `sonarjs/cognitive-complexity` is graduated to the error tier so any recurrence fails `spx validation`.

## Landed (session 02)

- S2871 (array sort without a compare function) cleared across product source and the co-located test suites by sorting through `compareAsciiStrings`. The mirror is partitioned into a warn tier and an error tier (`MIRROR_WARN_RULES` / `MIRROR_ERROR_RULES`), and `sonarjs/no-alphabetical-sort` graduated to the error tier — the two-tier enforcement model is declared in `15-local-quality-enforcement.adr.md` and `code-quality-analysis.md`.

## Pending

- SonarQube Cloud gate: create and assign the custom `spx — zero tolerance` gate — new-code-zero conditions now (session 01 operator task), overall-zero conditions in session 12 once the backlog clears. Server-side config, covered by the `[audit]` gate-policy assertions in `code-quality-analysis.md`; needs the SonarQube Cloud UI or a web-API token.
- Backlog: the remaining mirror-extension sessions add their rule classes (warn-tier while uncleared) and graduate each to error as its last occurrence is cleared; the PRNG recurrence guard is in the error tier, and the per-file clearing distributes across sessions' touched-file collateral. Session 12 locks the overall-zero gate.
