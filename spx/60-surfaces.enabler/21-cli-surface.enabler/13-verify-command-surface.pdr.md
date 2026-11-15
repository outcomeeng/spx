# Verification Command Surface

DEFINES existing-run command path AS `input`, `scope add`, `finding add`, `reconcile`, `finish`, `status`, `render`, or `compare` of `spx verification run`
DEFINES run-inspection command path AS `status`, `render`, `list`, or `compare` of `spx verification run`

GOVERNS the noun-grouped `spx verification` command family that exposes every verification activity
SO THAT agents, CI jobs, launchers, and operators recording, executing, or inspecting a verification run
CAN RELY ON `spx verification run` for a run its caller drives and for reading back any run, `spx verification <type> run` for a run SPX executes, and `spx verification input` for inspecting a verification input before any run exists

## Verification

### Test.Compliance: option grammar

- change-identity-option: ALWAYS: Change identity option grammar is `--change <owner/repo#N>`, which `start` accepts to record the Change the run serves and `list` and `compare` require.
- content-normalization: ALWAYS: content normalization is `none`, the original captured bytes, by default, or `utf8-universal-newlines`, strict UTF-8 text with each CRLF and each lone CR as LF, identified with its version; `start` accepts `--content-normalization <normalization>` with `--expect-content-sha256 <digest>`, and `input` accepts it with `--check-file <file>`.
- evidence-payload-source: ALWAYS: `scope add` and `finding add` require `--idempotency-key <key>` and exactly one of `--payload <payload-source>` and `--run-payload <name>`.
- finish-metadata-source: ALWAYS: `finish` requires `--terminal-status <status>` and accepts at most one of `--terminal-metadata <payload-source>` and `--run-payload <name>`.
- run-payload-option: ALWAYS: `--run-payload <name>` reads the file of that name in the run's payload directory, while `--payload` reads standard input for `stdin` and otherwise the file path of that name from the effective invocation directory.
- run-relative-payload-contained: NEVER: an existing-run command path reads a run-relative payload whose path, resolved through symbolic links, lies outside the run's payload directory.

### Test.Compliance: command results

- paths-report: ALWAYS: `paths` takes the verification type and scope options alone and reports the canonical scope identity, the branch key, and each directory a run of that verification type and scope writes, the payload root among them with role `payloads`, per [`spx/34-verification.enabler/15-run-write-paths.pdr.md`](spx/34-verification.enabler/15-run-write-paths.pdr.md).
- expectations-binding: ALWAYS: `--expectations <expectations-source>` binds the changes a changeset run must judge to the run when the run starts, `reconcile` reports the run's unaccounted, unexpected, and drifted paths as one structured result, and the first `finish` of a run bound to expectations records terminal completion only when the run reconciles.
- inspection-any-drive-mode: ALWAYS: the run-inspection command paths read back a run produced through either drive mode: `status` and `render` address one run by its run token, `list --change <owner/repo#N>` lists the runs recorded for one Change, and `compare --change <owner/repo#N>` addresses two runs of that Change by two run tokens and compares them.
- input-inspect-opens-no-run: ALWAYS: `spx verification input inspect <path>` reports one product file's canonical product-relative path and content digests and opens no run.
- start-report-fields: ALWAYS: `start` requires `--input <input-source>` and reports `runToken`, `contextDigest`, `resolvedScope`, `input`, `locator`, and `payloadDirectory`.
- payload-removal-diagnostic: ALWAYS: when the result of `finish` carries a payload-removal failure, the command writes a diagnostic naming the directory to standard error and exits as it would without the failure.

### Test.Mapping: scope-option-mapping

Caller-driven scope options map each scope type to the selector supplied through `--scope`.

| Case      | Scope options                                       |
| --------- | --------------------------------------------------- |
| changeset | `--scope-type changeset --scope <base>..<head>`     |
| file      | `--scope-type file --scope <product-relative-path>` |

### Test.Mapping: run-command-paths

`spx verification run` exposes one command path for each caller action.

| Case        | Command path                       |
| ----------- | ---------------------------------- |
| paths       | `spx verification run paths`       |
| start       | `spx verification run start`       |
| input       | `spx verification run input`       |
| scope-add   | `spx verification run scope add`   |
| finding-add | `spx verification run finding add` |
| reconcile   | `spx verification run reconcile`   |
| finish      | `spx verification run finish`      |
| status      | `spx verification run status`      |
| render      | `spx verification run render`      |
| list        | `spx verification run list`        |
| compare     | `spx verification run compare`     |

### Test.Mapping: input-command-paths

`spx verification input` exposes one command path, which takes one positional product path operand, per [`spx/29-verification-path-scope.pdr.md`](spx/29-verification-path-scope.pdr.md).

| Case    | Command path                            |
| ------- | --------------------------------------- |
| inspect | `spx verification input inspect <path>` |

### Test.Compliance: verification types

- type-noun-run: ALWAYS: `spx verification <type> run` names the verification type as a noun carrying the `run` verb.
- type-run-operands: ALWAYS: `spx verification <type> run` narrows execution through positional product path operands, per [`spx/29-verification-path-scope.pdr.md`](spx/29-verification-path-scope.pdr.md).
- no-type-verb: NEVER: a verification type is exposed as a verb command path such as `spx verification validate` or `spx verification eval`.

### Test.Compliance: start and paths options

- expected-content-digest: ALWAYS: `start` given `--expect-content-sha256` rejects an input whose content digest differs before any run exists, and `input --check-file` exits zero exactly when the file's content equals the recorded input.
- verifier-option: ALWAYS: `start` accepts `--verifier <kind>:<id>` only with kind `person` or `agent` and an id holding at least one non-whitespace character, and rejects any other value, an empty or whitespace-only id included, before a run exists.
- expectations-option: ALWAYS: `start` accepts `--expectations <expectations-source>`, no existing-run command path accepts it, and `reconcile` exits zero exactly when the run reconciles.
- paths-options: ALWAYS: `paths` requires `--verification-type <type>`, `--scope-type <scope-type>`, and `--scope <scope>`, and rejects a `--run <run-token>` or `--input <input-source>` value.

### Test.Compliance: existing-run options

- run-token-count: ALWAYS: every existing-run command path requires `--run <run-token>`, once on every path but `compare` and twice on `compare`.
- compare-same-change: ALWAYS: `compare` rejects an invocation whose two `--run <run-token>` values are not both runs of the Change `--change <owner/repo#N>` names.
- no-fresh-input: NEVER: an existing-run command path accepts a fresh `--input <input-source>` value.
- no-append-command-paths: NEVER: expose public verification-run command paths named `append-scope` or `append-finding`.
- run-lookup-diagnostic: ALWAYS: a run-lookup failure on an existing-run command path names the requested run selectors and searched target.

### Audit

- family-not-top-level: ALWAYS: a verification activity is exposed under the `spx verification` command family rather than as a type-specific top-level command, as [verification command surface](knowledge/verification-command-surface.md) records.
- replayable-structured: ALWAYS: `spx verification` presents replayable command paths and agent-readable structured results.
- harness-driven-same-slot: NEVER: the verification-type noun slot admits only the types SPX executes directly — a verification SPX drives through an agent harness occupies the same slot.
- no-top-level-verb: NEVER: a top-level verb command such as `spx verify` manages verification runs.
