# PLAN

Pending implementation of the local quality-enforcement decision (`spx/21-infrastructure.enabler/43-code-quality-analysis.enabler/15-local-quality-enforcement.adr.md`). Sequenced across the `SonarQube zero-issues` session queue (`spx session todo`).

- Deterministic offline floor: enable type-aware linting (`parserOptions.projectService`) and `tseslint.configs.recommendedTypeChecked`, add `eslint-plugin-sonarjs` (and `eslint-plugin-unicorn`) to `eslint.config.ts`, run the SonarJS rule set at error. Implementing `[test]` assertion belongs to `spx/41-validation.enabler/32-typescript-validation.enabler/32-lint.enabler/lint.md`. Authored with its test via `/apply`.
- Pre-push gate: a Lefthook pre-push hook runs `sonar analyze --base origin/main` and blocks on any finding. Implementing `[test]` assertion belongs to this node. Authored with its test via `/apply`.
- SonarQube Cloud gate: create and assign the custom `spx — zero tolerance` gate (new-code-zero conditions first in session 01; overall-zero conditions in session 12 once the backlog clears). Server-side config — covered by the `[audit]` gate-policy assertions in `code-quality-analysis.md`; needs the SonarQube Cloud UI or a web-API token.
- The 365-issue backlog is drained by sessions 02–11, each flipping its mirrored ESLint rules from warn to error as its batch clears.

## /apply resume state (session 01)

Branch `work/sonarqube-zero-issues` (worktree spx-b). `/apply` flow position for the enforcement implementation:

- Steps 1–3 (understand, contextualize, architect): done. ADR `15-local-quality-enforcement.adr.md` authored and committed (`9cb15cf9`).
- Step 4 (architecture audit): APPROVED by `adr-auditor` (overall PASS). The one UNKNOWN — no DI/no-mocking audit rule — is resolved by keeping the implementation CONFIG-ONLY: a Lefthook-native `run` entry plus the `eslint.config.ts` declaration, with NO TypeScript orchestration module. A TS wrapper around `sonar analyze` would reopen the DI requirement, so do not add one.
- Resume at Step 5 (write tests, `test-typescript`). Scope is cross-node (touches repo-root `eslint.config.ts` and `lefthook.yml`), so audit gates run whole-changeset and Step 9 (changes-reviewer) is required before Step 10 (`/merge`).
- Placement correction: both `[test]` implementing assertions belong on THIS node (code-quality-analysis — dogfooding spx's own config), NOT the consumer-facing TS lint node. The eslint-mirror test exercises `buildEslintConfig()` (exported from `eslint.config.ts`): assert it enables type-aware linting (`parserOptions.projectService`) and includes the SonarJS rule set. The pre-push test asserts `lefthook.yml` declares the `sonar analyze --base origin/main` pre-push entry (its non-zero-on-finding behavior is an l3 SaaS path; a deterministic config-presence/conformance test plus the `[audit]` policy rule covers it).
- Implementation (Step 7): `pnpm add -D eslint-plugin-sonarjs eslint-plugin-unicorn`; enable `parserOptions.projectService` + `tseslint.configs.recommendedTypeChecked`; wire sonarjs/unicorn at WARN (so `pnpm run validate` stays green over the existing 365); add the Lefthook pre-push `sonar analyze` entry.
