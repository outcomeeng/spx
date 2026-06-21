# PLAN

Pending implementation of the local quality-enforcement decision (`spx/21-infrastructure.enabler/43-code-quality-analysis.enabler/15-local-quality-enforcement.adr.md`). Sequenced across the `SonarQube zero-issues` session queue (`spx session todo`).

- Deterministic offline floor: enable type-aware linting (`parserOptions.projectService`) and `tseslint.configs.recommendedTypeChecked`, add `eslint-plugin-sonarjs` (and `eslint-plugin-unicorn`) to `eslint.config.ts`, run the SonarJS rule set at error. Implementing `[test]` assertion belongs to `spx/41-validation.enabler/32-typescript-validation.enabler/32-lint.enabler/lint.md`. Authored with its test via `/apply`.
- Pre-push gate: a Lefthook pre-push hook runs `sonar analyze --base origin/main` and blocks on any finding. Implementing `[test]` assertion belongs to this node. Authored with its test via `/apply`.
- SonarQube Cloud gate: create and assign the custom `spx — zero tolerance` gate (new-code-zero conditions first in session 01; overall-zero conditions in session 12 once the backlog clears). Server-side config — covered by the `[audit]` gate-policy assertions in `code-quality-analysis.md`; needs the SonarQube Cloud UI or a web-API token.
- The 365-issue backlog is drained by sessions 02–11, each flipping its mirrored ESLint rules from warn to error as its batch clears.
