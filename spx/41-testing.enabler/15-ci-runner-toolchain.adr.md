# CI Test-Runner Toolchain Provisioning

Continuous integration provisions the test-runner toolchain for every registered language whose testing node ships an `l2` real-tool test, in a step ordered before the step that runs the suite. Provisioning installs the toolchain the language's runner descriptor invokes, and `l2` real-tool tests run unconditionally — the environment supplies the toolchain rather than the test detecting its absence and skipping.

## Rationale

`l2` evidence exists to prove the descriptor drives the real runner. Skipping `l2` when the toolchain is absent turns the suite green without ever exercising the real runner — the exact regression `l2` evidence exists to catch — so provisioning the toolchain keeps that evidence load-bearing on every push. Installing the toolchain in a dedicated step before the suite keeps provisioning observable in the build log and off the test's runtime path, so a provisioning failure reads as a provisioning failure rather than a descriptor defect. The provisioning action caches the toolchain across runs, so honest `l2` evidence outweighs the one-time install cost.

A runner whose tool ships in the repository's installed dependencies is present wherever those dependencies are installed; only a runner driving a tool outside the repository's dependency set needs the environment to provision its toolchain. Gating `l2` off when the toolchain is absent was rejected because it defeats the purpose of `l2` evidence; provisioning on demand inside the test harness was rejected because it hides an environment dependency in the test runtime and repeats the install per test process; vendoring the foreign runner toolchain into the repository was rejected because it couples a single-language repository to a foreign package ecosystem for a tool it does not depend on at runtime.

## Invariants

- Every registered language whose testing node ships an `l2` real-tool test has its toolchain provisioned before the suite-running step in continuous integration.
- An `l2` real-tool test is never environment-gated off in continuous integration.

## Verification

### Audit

- ALWAYS: continuous integration provisions the test-runner toolchain for each registered language whose testing node ships an `l2` real-tool test, before the step that runs the suite — keeps `l2` evidence honest on every push ([audit])
- ALWAYS: an `l2` real-tool test runs unconditionally in continuous integration — the environment supplies the toolchain rather than the test skipping when it is absent ([audit])
- NEVER: environment-gate an `l2` real-tool test off (skip-when-absent) in continuous integration — provisioning supplies the toolchain instead, so a green suite always reflects a real-runner execution ([audit])
- NEVER: provision a runner toolchain lazily inside a test harness or test process — provisioning is a declarative continuous-integration step ([audit])
