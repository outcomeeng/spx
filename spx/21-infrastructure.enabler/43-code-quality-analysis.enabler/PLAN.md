# PLAN

Local quality-enforcement decision (`spx/21-infrastructure.enabler/43-code-quality-analysis.enabler/15-local-quality-enforcement.adr.md`), sequenced across the `SonarQube zero-issues` session queue (`spx session todo`).

## Landed (session 01)

- Type-aware lint mirror: `parserOptions.projectService` plus a curated SonarJS and `@typescript-eslint` rule set in `eslint-rules/offline-mirror.ts`, composed into `buildEslintConfig` and scoped to the tsconfig-covered trees, run warn-first so validation stays green over the existing backlog. `eslint-plugin-sonarjs` added.
- Pre-push gate: a Lefthook pre-push hook runs `sonar analyze --base origin/main`.

## Landed (session 06)

- Unicorn-family mirror: `eslint-plugin-unicorn` (65.0.1, for ESLint 9 peer compatibility) added to `eslint-rules/offline-mirror.ts` with `prefer-node-protocol`, `prefer-code-point`, `prefer-single-call`, and `prefer-string-raw` at the warn tier (backlog uncleared), plus the `unicorn` plugin registered in the mirror config block. The compliance test proves each unicorn rule flags a violating fixture and sits in the warn tier.
- The unicorn classes graduate to the error tier in whatever change clears their last occurrence. Under zero-debt-on-touch (`sonar analyze --base origin/main` blocks on every finding in a changed file), a cross-cutting unicorn sweep would inherit the whole backlog of every touched file, so the clearing distributes across each session's touched-file collateral instead.

## Pending

- SonarQube Cloud gate: create and assign the custom `spx — zero tolerance` gate — new-code-zero conditions now (session 01 operator task), overall-zero conditions in session 12 once the backlog clears. Server-side config, covered by the `[audit]` gate-policy assertions in `code-quality-analysis.md`; needs the SonarQube Cloud UI or a web-API token.
- Backlog: the remaining mirror-extension sessions add their rule classes (warn-tier while uncleared) and graduate each to error as its last occurrence is cleared; the per-file clearing distributes across sessions' touched-file collateral. Session 12 locks the overall-zero gate.
