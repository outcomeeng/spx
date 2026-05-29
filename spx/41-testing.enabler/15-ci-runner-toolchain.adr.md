# CI Test-Runner Toolchain Provisioning

## Purpose

This decision governs how the continuous-integration environment provides the language test-runner toolchains that `l2` real-tool tests under `spx/41-testing.enabler/` invoke.

## Context

**Business impact:** Each language testing enabler proves its runner descriptor at two depths: `l1`, where an injected command runner makes command construction and the detection gate verifiable without the real tool, and `l2`, where the descriptor drives the real runner end to end. `l1` evidence needs no external toolchain; `l2` evidence is honest only when the real runner is present in the execution environment. A runner whose tool ships in the repository's installed dependencies is present wherever those dependencies are installed; a runner that drives a tool outside the repository's dependency set has no toolchain in an environment provisioned only for the repository's own language.

**Technical constraints:** Continuous integration runs the whole suite, including `l2` tests, on every push. An `l2` test that invokes a runner absent from the environment fails for a missing toolchain rather than a wrong descriptor, conflating an environment gap with a descriptor defect. The descriptor-and-registry pattern that defines a registered language is fixed by `spx/19-language-registration.adr.md`; which languages ship an `l2` real-tool test is a property of each language's testing node, not of the orchestrator.

## Decision

Continuous integration provisions the test-runner toolchain for every registered language whose testing node ships an `l2` real-tool test, in a step ordered before the step that runs the suite. Provisioning installs the toolchain the language's runner descriptor invokes. `l2` real-tool tests run unconditionally; the environment supplies the toolchain rather than the test detecting its absence and skipping.

## Rationale

`l2` evidence exists to prove the descriptor drives the real runner. Skipping `l2` when the toolchain is absent turns the suite green without ever exercising the real runner — the exact regression `l2` evidence exists to catch. Provisioning the toolchain keeps that evidence load-bearing on every push. Installing the toolchain in a dedicated step before the suite keeps provisioning observable in the build log and off the test's runtime path, so a provisioning failure reads as a provisioning failure.

Alternatives considered:

- **Gate `l2` real-tool tests off when the toolchain is absent** — turns the suite green without exercising the real runner, defeating the purpose of `l2` evidence. Rejected.
- **Provision the toolchain on demand inside the test harness** — hides an environment dependency in the test runtime and repeats the install per test process. Rejected — provisioning is a declarative environment step.
- **Vendor the foreign runner toolchain into the repository** — couples a single-language repository to a foreign package ecosystem for a tool it does not depend on at runtime. Rejected — the environment provisions the toolchain instead.

## Trade-offs accepted

| Trade-off                                                                             | Mitigation / reasoning                                                                                             |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Continuous integration installs a toolchain the product does not depend on at runtime | Provisioning is scoped to languages whose nodes ship an `l2` test, and is one declarative step per such language   |
| `l2` provisioning adds wall-clock to every CI run                                     | The provisioning action caches the toolchain across runs; honest `l2` evidence outweighs the one-time install cost |

## Invariants

- Every registered language whose testing node ships an `l2` real-tool test has its toolchain provisioned before the suite-running step in continuous integration.
- An `l2` real-tool test is never environment-gated off in continuous integration.

## Compliance

### Recognized by

The continuous-integration workflow's test job contains a toolchain-provisioning step for each language whose testing node ships an `l2` real-tool test, ordered before the step that runs the suite.

### MUST

- Continuous integration provisions the test-runner toolchain for each registered language whose testing node ships an `l2` real-tool test, before the step that runs the suite — keeps `l2` evidence honest on every push ([review])
- An `l2` real-tool test runs unconditionally in continuous integration — the environment supplies the toolchain rather than the test skipping when it is absent ([review])

### NEVER

- Environment-gate an `l2` real-tool test off (skip-when-absent) in continuous integration — provisioning supplies the toolchain instead, so a green suite always reflects a real-runner execution ([review])
- Provision a runner toolchain lazily inside a test harness or test process — provisioning is a declarative continuous-integration step ([review])
