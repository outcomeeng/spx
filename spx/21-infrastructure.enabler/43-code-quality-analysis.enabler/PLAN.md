# PLAN

Local quality-enforcement decision (`spx/21-infrastructure.enabler/43-code-quality-analysis.enabler/15-local-quality-enforcement.adr.md`), sequenced across the `SonarQube zero-issues` session queue (`spx session todo`).

## Landed (session 01)

- Type-aware lint mirror: `parserOptions.projectService` plus a curated SonarJS and `@typescript-eslint` rule set in `eslint-rules/sonarjs-mirror.ts`, composed into `buildEslintConfig` and scoped to the tsconfig-covered trees, run warn-first so validation stays green over the existing backlog. `eslint-plugin-sonarjs` added.
- Pre-push gate: a Lefthook pre-push hook runs `sonar analyze --base origin/main`.

## Pending

- SonarQube Cloud gate: create and assign the custom `spx — zero tolerance` gate — new-code-zero conditions now (session 01 operator task), overall-zero conditions in session 12 once the backlog clears. Server-side config, covered by the `[audit]` gate-policy assertions in `code-quality-analysis.md`; needs the SonarQube Cloud UI or a web-API token.
- Backlog: sessions 02–11 extend the mirror (for example `eslint-plugin-unicorn` in session 06) and flip each batch's rules from warn to error as the 365-issue backlog clears; session 12 locks the overall-zero gate.
