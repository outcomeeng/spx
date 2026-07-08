# Local Quality Enforcement

spx enforces its own code-quality findings locally through a deterministic, offline ESLint mirror of SonarQube's findings — drawing each rule from whichever already-present ESLint plugin reproduces it (`eslint-plugin-sonarjs`, `@typescript-eslint`, ESLint core, `eslint-plugin-import`, `eslint-plugin-unicorn`, or the product's custom `spx` plugin), type-aware, run by `spx validation`. Server-side SonarQube Cloud automatic analysis remains the cloud backstop. The mirror runs each rule at one of two enforcement tiers — an error tier for finding classes with no remaining occurrence in the linted tree, where any new finding fails `spx validation`, and a warn tier for classes whose backlog is uncleared, which surface without failing the gate — and a class graduates from the warn tier to the error tier in the same change that clears its last occurrence.

## Rationale

Server-side automatic analysis runs after a change is pushed, so findings surface on code that has already left the developer's machine. Enforcing the same findings locally before push moves detection to where the fix is cheapest and keeps the backlog from growing.

The deterministic offline floor reproduces SonarQube's findings with ESLint rules already on the toolchain — `eslint-plugin-sonarjs` (SonarSource's own packaging of the SonarJS analyzer rules), `@typescript-eslint`, ESLint core, `eslint-plugin-import`, `eslint-plugin-unicorn`, and the product's custom `spx` plugin — so the local floor catches the same findings with no server, no network, and no new dependency. It requires type-aware linting (an injected TypeScript program): the rules that catch redundant casts, non-null assertions, and superfluous narrowings depend on type information and cannot run without it, which is why a type-unaware ESLint configuration and the TypeScript compiler both stay silent on them.

The SonarQube analyzer emits modernization rules that `eslint-plugin-sonarjs` does not package — the unicorn family (the `node:` import protocol, `codePointAt` over `charCodeAt`, combined consecutive array pushes, `String.raw` for escaped backslashes). `eslint-plugin-unicorn` provides the ESLint rules that enforce those same modernizations, so the offline floor composes both plugins to mirror the analyzer's findings without a server. A unicorn class enters at the warn tier because its backlog is uncleared, graduating to error on the same warn-to-error path every mirrored class follows once its last occurrence is cleared.

A continuous-integration job running `sonar-scanner` is rejected: it runs after push, duplicates the server's automatic analysis, and ingests results into the project from CI, which this node's analysis model forbids.

## Verification

### Testing

- ALWAYS: the mirror rule set, run through ESLint, reports a finding on source that violates a mirrored rule ([compliance])
- ALWAYS: the mirror partitions its rules into an error tier and a warn tier, running each tier's rules at the corresponding ESLint severity ([compliance])

### Audit

- ALWAYS: `buildEslintConfig` composes the mirror — type-aware parser options and the mirror rule set — into the flat config `spx validation lint` runs, so the mirror reaches the product's own source ([audit])
- ALWAYS: code-quality findings covered by the deterministic mirror are enforced locally through `spx validation`, with server-side automatic analysis serving as the cloud backstop ([audit])
- ALWAYS: offline-first governs the inner development loop — validation, testing, and context loading require no network — while the push and merge boundary may require network ([audit])
- NEVER: the deterministic offline ESLint floor is weakened to match server-side SonarQube Cloud behavior ([audit])
- ALWAYS: a mirror rule runs at the error tier only when its finding class has no remaining occurrence in the linted tree; an uncleared class runs at the warn tier so `spx validation` stays green over the backlog ([audit])
- ALWAYS: TypeScript surfaces governed by this decision expose configuration behavior through source-owned functions or declarative config that tests can inspect directly ([audit])
- NEVER: tests for the mirror boundary replace ESLint, git, or filesystem modules through framework-level module replacement; when a boundary cannot run as a cheap local system, evidence verifies the exported config or injected runner contract ([audit])
