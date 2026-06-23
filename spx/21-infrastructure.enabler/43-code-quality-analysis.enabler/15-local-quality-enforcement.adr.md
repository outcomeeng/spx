# Local Quality Enforcement

spx enforces its own code-quality findings locally, before a change is pushed, on two must-pass gates: a deterministic, offline ESLint mirror of the SonarQube analyzer rule set — type-aware, run by `spx validation` — and a mandatory `sonar analyze --base origin/main` run at the Lefthook pre-push hook and in the merge lifecycle. Server-side SonarQube Cloud automatic analysis remains the post-merge backstop. The mirror runs each rule at one of two enforcement tiers: an error tier for finding classes with no remaining occurrence in the linted tree, where any new finding fails `spx validation`, and a warn tier for classes whose backlog is uncleared, which surface without failing the gate. A class graduates from the warn tier to the error tier in the same change that clears its last occurrence.

## Rationale

Server-side automatic analysis runs after a change is pushed, so findings surface on code that has already left the developer's machine. Enforcing the same findings locally before push moves detection to where the fix is cheapest and keeps the backlog from growing.

The deterministic offline floor is `eslint-plugin-sonarjs` — SonarSource's own packaging of the SonarJS analyzer rules into ESLint — so the local floor runs the same rules with no server and no network. It requires type-aware linting (an injected TypeScript program): the rules that catch redundant casts, non-null assertions, and superfluous narrowings depend on type information and cannot run without it, which is why a type-unaware ESLint configuration and the TypeScript compiler both stay silent on them.

The SonarQube analyzer emits modernization rules that `eslint-plugin-sonarjs` does not package — the unicorn family (the `node:` import protocol, `codePointAt` over `charCodeAt`, combined consecutive array pushes, `String.raw` for escaped backslashes). `eslint-plugin-unicorn` provides the ESLint rules that enforce those same modernizations, so the offline floor composes both plugins to mirror the analyzer's findings without a server. A unicorn class enters at the warn tier because its backlog is uncleared, graduating to error on the same warn-to-error path every mirrored class follows once its last occurrence is cleared.

`sonar analyze` is the second gate at the push boundary. It runs Cloud agentic analysis, which is non-deterministic and requires network; both are acceptable there because a push is itself an online act. Offline-first governs the inner development loop — validation, testing, context loading must work without a network — and does not extend to the push and merge boundary.

A continuous-integration job running `sonar-scanner` is rejected: it runs after push, duplicates the server's automatic analysis, and ingests results into the project from CI, which this node's analysis model forbids.

## Verification

### Testing

- ALWAYS: the offline mirror rule set — drawn from `eslint-plugin-sonarjs` and `eslint-plugin-unicorn` — run through ESLint, reports a finding on source that violates a mirrored rule ([compliance])
- ALWAYS: the mirror partitions its rules into an error tier and a warn tier, running each tier's rules at the corresponding ESLint severity ([compliance])

### Audit

- ALWAYS: `buildEslintConfig` composes the offline mirror — type-aware parser options and the mirror rule set drawn from both `eslint-plugin-sonarjs` and `eslint-plugin-unicorn` — into the flat config `spx validation lint` runs, so the mirror reaches the product's own source ([audit])
- ALWAYS: the Lefthook pre-push hook runs `sonar analyze --base origin/main` and a finding blocks the push — the entry is config-only, and `sonar analyze`'s non-zero-on-finding behavior is a network-bound agentic path no offline test can falsify ([audit])
- ALWAYS: code-quality findings are enforced locally before push, with server-side automatic analysis serving only as the post-merge backstop ([audit])
- ALWAYS: offline-first governs the inner development loop — validation, testing, and context loading require no network — while the push and merge boundary may require network ([audit])
- NEVER: the deterministic offline ESLint floor is weakened to make the non-deterministic agentic gate pass — a suspected-flaky agentic finding is re-verified by re-running the analysis, never suppressed ([audit])
- ALWAYS: a mirror rule runs at the error tier only when its finding class has no remaining occurrence in the linted tree; an uncleared class runs at the warn tier so `spx validation` stays green over the backlog ([audit])
