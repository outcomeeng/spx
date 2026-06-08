# Python Test Runner Architecture

The Python test runner is a `pythonTestingLanguage` descriptor exported from `src/testing/languages/python.ts`, conforming to the `TestingLanguageDescriptor` contract of `spx/19-language-registration.adr.md`. It detects Python presence, invokes pytest, and derives passing-scope exclusion flags entirely through injected dependencies — the command runner and the detection function — so command construction, the detection gate, and flag generation are verifiable at `l1` without the real tool. The descriptor exposes `name` (`python`), `testFilePatterns` (`test_*.py`) and a matching predicate over file paths, `detect(projectRoot, deps)` delegating to the injected `detectPython`, `excludeFlag(nodePath)` mapping an excluded node path to `--ignore=spx/{nodePath}/`, and `runTests(request, deps)` invoking `uv run pytest` through the injected command runner over the supplied test paths and exclusion flags and returning a runner outcome carrying the process exit code. The runner constructs no rootdir flag; pytest derives its rootdir, configuration discovery, and managed environment from the command runner's working directory and the supplied paths.

## Rationale

Injecting the command runner and the detection function makes command construction, the detection gate, and exclusion-flag generation verifiable at `l1` without invoking real pytest or mocking. Passing exclusions as invocation-time flags keeps the product's `pyproject.toml` unmodified, and routing pytest through `uv run` reuses the project's managed Python environment rather than resolving an interpreter or a pytest entry point directly. Modeling the runner as an ADR-19 descriptor lets the parent dispatch iterate registered languages without naming Python, and the descriptor contract is the same module its TypeScript peer imports. Routing through `uv run` keeps the production command stable where the spx repository declares no Python environment of its own: continuous integration provisions the managed Python toolchain per `spx/41-testing.enabler/15-ci-runner-toolchain.adr.md` and the `l2` test harness supplies pytest ephemerally via `uv run --with pytest`, so the descriptor never adapts to an absent tool.

Writing exclusions into `pyproject.toml` was rejected because it mutates product configuration the node must never write; resolving and spawning the pytest entry point directly was rejected because it bypasses the managed environment and hardcodes an interpreter path; detecting Python inside the runner via direct filesystem reads was rejected because it duplicates `detectPython` and couples the runner to the filesystem; skipping the detection gate to let pytest no-op on a non-Python project was rejected because it invokes a subprocess pointlessly and conflates "absent" with "passed"; encoding the test level in a pytest marker selected via `-m` was rejected because level is already encoded in the test filename (`l1`, `l2`, `l3`) and level selection belongs to the parent dispatch's discovery, not the runner descriptor.

## Invariants

- Command construction is a pure function of the supplied test paths and exclusion flags.
- The detection gate short-circuits before any subprocess is spawned when Python is absent.
- No product configuration file is written during detection, flag generation, or invocation.
- An excluded node path maps to exactly one `--ignore=spx/{nodePath}/` flag.

## Verification

### Audit

- ALWAYS: `runTests` accepts an injected command-execution dependency — enables `l1` testing of command construction without invoking pytest or mocking ([audit])
- ALWAYS: the detection predicate delegates to an injected `detectPython` — enables `l1` testing of the gate ([audit])
- ALWAYS: `excludeFlag` maps an excluded node path to `--ignore=spx/{nodePath}/` as a pure function ([audit])
- ALWAYS: pytest is invoked through `uv run pytest` so the project's managed Python environment provides the tool ([audit])
- ALWAYS: test-file pattern matching for `test_*.py` is a pure function over file paths ([audit])
- ALWAYS: the descriptor conforms to the `TestingLanguageDescriptor` contract per `spx/19-language-registration.adr.md` ([audit])
- NEVER: write to `pyproject.toml` — exclusions pass as invocation-time flags ([audit])
- NEVER: invoke pytest when the injected `detectPython` reports Python absent ([audit])
- NEVER: import `execa` or `node:child_process` directly inside the runner functions — subprocess execution goes through the injected dependency ([audit])
- NEVER: hardcode language dispatch in orchestration — registration is through the descriptor per `spx/19-language-registration.adr.md` ([audit])
- NEVER: encode test-level vocabulary (pytest markers, `-m` selectors) in the descriptor — level lives in the test filename and is the parent dispatch's concern ([audit])
