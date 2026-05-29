# Python Test Runner Architecture

## Purpose

This decision governs how the Python test runner detects Python presence, invokes pytest, and derives passing-scope exclusion flags, exposed as a descriptor conforming to `spx/19-language-registration.adr.md`.

## Context

**Business impact:** `spx test` and `spx test passing` dispatch test files to the language runner registered for each extension. The Python runner executes pytest over discovered test files, honoring passing-scope exclusions, without touching the product's own Python configuration.

**Technical constraints:** Python presence is determined by the product's `detectPython` detection function, governed by `spx/17-language-detection.enabler/32-python.enabler`, which recognizes a `pyproject.toml`. pytest runs through `uv run pytest` so the project's managed Python environment provides the tool. pytest resolves its rootdir, configuration, and managed environment from the working directory in which it runs, so the runner's working root is the directory the injected command runner executes in rather than a runner CLI flag. The descriptor-and-registry registration pattern is fixed by `spx/19-language-registration.adr.md`; the central registry and the `spx test` dispatch that consumes it are the parent `spx/41-testing.enabler/testing.md` concern, not this node. Provisioning the pytest toolchain for the real-runner test in continuous integration is governed by `spx/41-testing.enabler/15-ci-runner-toolchain.adr.md`.

## Decision

Export a `pythonTestingLanguage` descriptor from `src/testing/languages/python.ts` that conforms to a `TestingLanguageDescriptor` contract: it carries the language name, a detection predicate delegating to injected `detectPython`, the pytest test-file patterns, a pure exclusion-flag generator, and a `runTests` operation that invokes `uv run pytest` through an injected command runner with the supplied test paths and the generated exclusion flags. Every external dependency — the command runner and the detection function — is injected.

The descriptor exposes:

1. `name` — the language identity (`python`)
2. `detect(projectRoot, deps)` — presence predicate delegating to the injected `detectPython`
3. `testFilePatterns` — the pytest target patterns (`test_*.py`)
4. `excludeFlag(nodePath)` — pure mapping from an excluded node path to the pytest flag `--ignore=spx/{nodePath}/`
5. `runTests(request, deps)` — invokes `uv run pytest` through the injected command runner over the supplied test paths and exclusion flags, returning a runner outcome carrying the process exit code

The runner's working root is the request's `projectRoot`: pytest takes its rootdir, configuration discovery, and managed environment from the command runner's working directory, so the descriptor passes pytest the discovered test paths and exclusion flags while the consumer binds the injected command runner to `projectRoot`. The runner constructs no rootdir flag, because pytest derives the rootdir from the working directory and the supplied paths.

## Rationale

Injecting the command runner and the detection function makes command construction, the detection gate, and exclusion-flag generation verifiable at `l1` without invoking real pytest or mocking. Passing exclusions as invocation-time flags keeps the product's `pyproject.toml` unmodified, satisfying the node's NEVER constraint. Routing pytest through `uv run` reuses the project's managed Python environment rather than resolving an interpreter or a pytest entry point directly. Modeling the runner as an ADR-19 descriptor lets the parent dispatch iterate registered languages without naming Python.

Alternatives considered:

- **Write exclusions into `pyproject.toml`** — mutates product configuration the node must never write; exclusion belongs at invocation time. Rejected.
- **Resolve and spawn the pytest entry point directly** — bypasses the project's managed Python environment and hardcodes an interpreter path. Rejected — invoke through `uv run`.
- **Detect Python inside the runner via direct filesystem reads** — duplicates `detectPython` and couples the runner to the filesystem. Rejected — delegate to the injected detection function.
- **Skip the detection gate and let pytest no-op on a non-Python project** — invokes a subprocess pointlessly and conflates "absent" with "passed". Rejected — gate before invocation.
- **Encode the test level in a pytest marker and select levels via `-m`** — the spec declares no marker assertion, and level is already encoded in the test filename (`l1`, `l2`, `l3`); level selection belongs to the parent dispatch's discovery, not the runner descriptor. Rejected — the descriptor carries no marker vocabulary.

## Trade-offs accepted

| Trade-off                                                              | Mitigation / reasoning                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invocation through `uv run` adds a process layer                       | The injected command runner makes command construction `l1`-testable; the real subprocess is covered at the `l2` level                                                                                                                                      |
| The exclusion-flag string is coupled to the pytest CLI                 | The mapping is isolated in one pure `excludeFlag` function, so a CLI change touches one place                                                                                                                                                               |
| The descriptor's production command assumes the project manages pytest | The descriptor invokes `uv run pytest` faithfully; an `l2` test harness provisions pytest ephemerally (a `uv run --with pytest` provision) because the spx repository declares no Python environment, keeping the descriptor's production command unchanged |
| The descriptor contract is shared with the TypeScript peer             | The contract conforms to `spx/19-language-registration.adr.md`; the same-index peer imports the same contract module                                                                                                                                        |

## Invariants

- Command construction is a pure function of the supplied test paths and exclusion flags
- The detection gate short-circuits before any subprocess is spawned when Python is absent
- No product configuration file is written during detection, flag generation, or invocation
- An excluded node path maps to exactly one `--ignore=spx/{nodePath}/` flag

## Compliance

### Recognized by

Observable injected command-runner and detection dependencies on the runner functions. The descriptor is a value exported from `src/testing/languages/python.ts` conforming to the `TestingLanguageDescriptor` contract.

### MUST

- `runTests` accepts an injected command-execution dependency — enables `l1` testing of command construction without invoking pytest or mocking ([review])
- The detection predicate delegates to an injected `detectPython` — enables `l1` testing of the gate ([review])
- `excludeFlag` maps an excluded node path to `--ignore=spx/{nodePath}/` as a pure function ([review])
- pytest is invoked through `uv run pytest` so the project's managed Python environment provides the tool ([review])
- Test-file pattern matching for `test_*.py` is a pure function over file paths ([review])
- The descriptor conforms to the `TestingLanguageDescriptor` contract per `spx/19-language-registration.adr.md` ([review])

### NEVER

- Write to `pyproject.toml` — exclusions pass as invocation-time flags ([review])
- Invoke pytest when the injected `detectPython` reports Python absent ([review])
- Import `execa` or `node:child_process` directly inside the runner functions — subprocess execution goes through the injected dependency ([review])
- Hardcode language dispatch in orchestration — registration is through the descriptor per `spx/19-language-registration.adr.md` ([review])
- Encode test-level vocabulary (pytest markers, `-m` selectors) in the descriptor — level lives in the test filename and is the parent dispatch's concern ([review])
