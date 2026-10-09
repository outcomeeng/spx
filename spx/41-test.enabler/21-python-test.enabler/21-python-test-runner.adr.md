# Python Test Runner Architecture

The Python test runner is a `pythonTestingLanguage` descriptor exported from `src/test/languages/python.ts`, conforming to the `TestingLanguageDescriptor` contract of [`spx/19-language-registration.adr.md`](spx/19-language-registration.adr.md). It detects Python presence, invokes pytest, and derives passing-scope exclusion flags in the descriptor module, so command construction, the detection gate, and flag generation are verifiable at `l1` without the real tool. The descriptor exposes `name` (`python`), `testFilePatterns` (`test_*.py`) and a matching predicate over file paths, `detect(productDir, deps?)` resolving Python presence through descriptor-owned detection with an optional test override, `excludeFlag(nodePath)` mapping an excluded node path to `--ignore=spx/{nodePath}/`, and `runTests(request, deps)` invoking `uv run --active pytest` through the injected command runner over the supplied test paths and exclusion flags and returning a runner outcome carrying the process exit code and optional path verdicts. The verdict per path comes from pytest's JUnit XML output, which `runTests` requests through `--junitxml` into a run-scoped file under the run's `.spx/worktree/test/` location; the adapter reads that file once the pytest process exits and, when the report is readable, maps the testcases of each supplied test file to `passed`, `failed`, or `not-run`; the dispatch layer records `not-run` for every supplied path whose outcome carries no path verdicts, per [`spx/41-test.enabler/43-last-run-evidence.enabler/11-last-run-file.adr.md`](spx/41-test.enabler/43-last-run-evidence.enabler/11-last-run-file.adr.md). The runner constructs no rootdir flag; pytest derives its rootdir and configuration discovery from the command runner's working directory and resolves the tool from the active managed environment the suite provisions.

## Rationale

Injecting the command runner and allowing a test-only detection override makes command construction, the detection gate, and exclusion-flag generation verifiable at `l1` through deterministic function seams. Passing exclusions as invocation-time flags keeps the product's `pyproject.toml` unmodified, and routing pytest through `uv run --active` reuses the provisioned active Python environment rather than resolving an interpreter or a pytest entry point directly. Modeling the runner as an ADR-19 descriptor lets the parent dispatch iterate registered languages without naming Python, and the descriptor contract is the same module its TypeScript peer imports. Routing through `uv run --active` keeps the production command stable where the spx repository declares no Python environment of its own: continuous integration provisions and exports the managed Python toolchain per [`spx/41-test.enabler/15-ci-runner-toolchain.adr.md`](spx/41-test.enabler/15-ci-runner-toolchain.adr.md), so the descriptor and `l2` test harness never adapt to an absent tool.

A file's exit code is no verdict for the files it ran beside: one pytest invocation spans many test files, so the process exit code alone would mark every file the invocation covered with the result of its worst file. The machine-readable report attributes a result to each file, and reading it keeps a failing file from marking its passing neighbours `failed`. A file the report omits is `not-run`. A missing or unreadable report yields an outcome with no path verdicts and a non-zero exit code, and the dispatch layer records every supplied path `not-run`, so the absence of a report stays distinct from a pass.

Runner descriptors own test scope because writing exclusions into `pyproject.toml` mutates product configuration the node must never write. The managed environment owns pytest execution so the runner neither bypasses environment management nor hardcodes an interpreter path. The language registry owns Python detection through `detectPython`, keeping filesystem access outside the runner. The detection gate prevents pointless subprocess invocation and preserves the distinction between "absent" and "passed". Test filenames encode level (`l1`, `l2`, `l3`), while parent dispatch discovery owns level selection.

## Invariants

- Command construction is a pure function of the supplied test paths and exclusion flags.
- The detection gate short-circuits before any subprocess is spawned when Python is absent.
- No product configuration file is written during detection, flag generation, or invocation.
- An excluded node path maps to exactly one `--ignore=spx/{nodePath}/` flag.
- A runner outcome from `runTests` whose JUnit XML report is readable holds one verdict per supplied test path, drawn from `passed`, `failed`, and `not-run`.
- A path verdict derives from the pytest JUnit XML report for that test file and never from the process exit code.
- A test path the JUnit XML report omits is `not-run`.
- A pytest invocation whose JUnit XML report is missing or unreadable yields an outcome with no path verdicts and a non-zero exit code; the dispatch layer records `not-run` for every supplied path.

## Verification

- ALWAYS: `runTests` requests pytest's JUnit XML output into a run-scoped file under the run's `.spx/worktree/test/` location and reads it once the pytest process exits
- ALWAYS: the runner outcome from `runTests` reports a verdict per supplied test path taken from the JUnit XML report for that file when the report is readable
- ALWAYS: a supplied test path the JUnit XML report omits is reported `not-run`
- ALWAYS: a missing or unreadable JUnit XML report yields a runner outcome with no path verdicts and a non-zero exit code, so the dispatch layer records every supplied test path `not-run`
- NEVER: derive a path verdict from the exit code of the pytest process that covered the path

### Audit

- ALWAYS: `runTests` accepts an injected command-execution dependency so `l1` tests supply a deterministic command function and inspect the constructed invocation ([audit])
- ALWAYS: the detection predicate is owned by the Python descriptor and accepts only a test override for `l1` gate tests ([audit])
- ALWAYS: `excludeFlag` maps an excluded node path to `--ignore=spx/{nodePath}/` as a pure function ([audit])
- ALWAYS: pytest is invoked through `uv run --active pytest` so the provisioned active Python environment provides the tool ([audit])
- ALWAYS: test-file pattern matching for `test_*.py` is a pure function over file paths ([audit])
- ALWAYS: the descriptor conforms to the `TestingLanguageDescriptor` contract per [`spx/19-language-registration.adr.md`](spx/19-language-registration.adr.md) ([audit])
- NEVER: write to `pyproject.toml` — exclusions pass as invocation-time flags ([audit])
- NEVER: invoke pytest when Python is absent — the descriptor's `detect` function calls `detectPython` directly when no test override is provided ([audit])
- NEVER: import `execa` or `node:child_process` directly inside the runner functions — subprocess execution goes through the injected dependency ([audit])
- NEVER: hardcode language dispatch in orchestration — registration is through the descriptor per [`spx/19-language-registration.adr.md`](spx/19-language-registration.adr.md) ([audit])
- NEVER: encode test-level vocabulary (pytest markers, `-m` selectors) in the descriptor — level lives in the test filename and is the parent dispatch's concern ([audit])
