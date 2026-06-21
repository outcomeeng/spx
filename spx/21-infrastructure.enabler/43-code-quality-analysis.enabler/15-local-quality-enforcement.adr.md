# Local Quality Enforcement

spx enforces its own code-quality findings locally, before a change is pushed, on two must-pass gates: a deterministic, offline ESLint mirror of the SonarJS rule set — type-aware, run by `spx validation` — and a mandatory `sonar analyze --base origin/main` run at the Lefthook pre-push hook and in the merge lifecycle. Server-side SonarQube Cloud automatic analysis remains the post-merge backstop.

## Rationale

Server-side automatic analysis runs after a change is pushed, so findings surface on code that has already left the developer's machine. Enforcing the same findings locally before push moves detection to where the fix is cheapest and keeps the backlog from growing.

The deterministic offline floor is `eslint-plugin-sonarjs` — SonarSource's own packaging of the SonarJS analyzer rules into ESLint — so the local floor runs the same rules with no server and no network. It requires type-aware linting (an injected TypeScript program): the rules that catch redundant casts, non-null assertions, and superfluous narrowings depend on type information and cannot run without it, which is why a type-unaware ESLint configuration and the TypeScript compiler both stay silent on them.

`sonar analyze` is the second gate at the push boundary. It runs Cloud agentic analysis, which is non-deterministic and requires network; both are acceptable there because a push is itself an online act. Offline-first governs the inner development loop — validation, testing, context loading must work without a network — and does not extend to the push and merge boundary.

A continuous-integration job running `sonar-scanner` is rejected: it runs after push, duplicates the server's automatic analysis, and ingests results into the project from CI, which this node's analysis model forbids.

## Verification

### Testing

- ALWAYS: the SonarJS mirror rule set, run through ESLint, reports a finding on source that violates a mirrored rule ([test])

### Audit

- ALWAYS: `buildEslintConfig` composes the SonarJS mirror — type-aware parser options and the mirror rule set — into the flat config `spx validation lint` runs, so the mirror reaches the product's own source ([audit])
- ALWAYS: the Lefthook pre-push hook runs `sonar analyze --base origin/main` and a finding blocks the push — the entry is config-only, and `sonar analyze`'s non-zero-on-finding behavior is a network-bound agentic path no offline test can falsify ([audit])
- ALWAYS: code-quality findings are enforced locally before push, with server-side automatic analysis serving only as the post-merge backstop ([audit])
- ALWAYS: offline-first governs the inner development loop — validation, testing, and context loading require no network — while the push and merge boundary may require network ([audit])
- NEVER: the deterministic offline ESLint floor is weakened to make the non-deterministic agentic gate pass — a suspected-flaky agentic finding is re-verified by re-running the analysis, never suppressed ([audit])
