# Diagnose Engine

`spx diagnose` is a deterministic environment-diagnostics pipeline — gather each configured check's readings, classify each reading set against a fixed per-check verdict table, fold the per-check verdicts into one overall verdict, and emit a per-check and overall report in text or JSON — composed as the `diagnose` command domain per [`spx/14-cli-composition.adr.md`](../14-cli-composition.adr.md). The consumer-varying facts the pipeline judges against resolve by the precedence a supplied manifest, then the `spx.config` diagnose section, then per-check safe defaults, per [`spx/54-diagnose.enabler/11-invocation-modes.pdr.md`](11-invocation-modes.pdr.md); a check whose fact is absent under every source degrades against its safe default rather than failing. Every reading is obtained through a dependency-injected runner over a command, environment variable, or filesystem probe; no language model participates at any stage.

A manifest is the fully-instrumented contract a consumer supplies to `spx diagnose`, carrying exactly the facts the `spx` CLI cannot know on its own:

```json
{
  "spx_floor": "<semver>",
  "marketplace": { "name": "<string>", "source": "<owner/repo>" },
  "expected_plugins": ["<string>", "..."],
  "checks": ["<check-name>", "..."]
}
```

The `checks` array names the check set the pipeline runs, in order. Within a manifest, each consumer-fact field is required exactly when a check that reads it is selected: `spx_floor` when `spx-reachability` is selected, `marketplace` and `expected_plugins` when `marketplace-install` is selected. When the facts resolve from the `spx.config` diagnose section instead, the check set defaults to every check the build provides and an absent fact degrades its check against a safe default rather than being rejected. The overall verdict folds the per-check buckets by the fixed precedence broken > unknown > degraded > healthy, excluding not-applicable, and the process exit code maps the overall verdict: healthy to 0, degraded to 1, unknown to 2, broken to 3.

## Rationale

The classification is a lookup against fixed tables and a fixed precedence fold, so it is a deterministic function of its readings — verifiable by automated tests under the testing verdict mode rather than re-derived by a language model on every invocation. Running the classification as model prose makes each consumer re-pay a per-invocation token cost to reproduce a table the product already owns and yields no verifiable contract; the product-level rule that deterministic operations never use LLM inference governs here. The remediation judgment a model genuinely adds — reading a non-healthy report and proposing context-aware fixes — stays in the consuming skill, above the pipeline's verbatim output.

The consumer-varying facts — the version floor a product requires, the marketplace it depends on, the methodology plugins it expects, and the checks it runs — are the consumer's, not the `spx` CLI's. Resolving them from the consumer's own `spx.config` diagnose section, or from a manifest the consumer passes by path, keeps the CLI generic across the products a methodology marketplace installs into; binding any of them into the CLI would couple it to one consumer. Configuration resolution lets a user run `spx diagnose` with no arguments and still judge against the product's facts, while the manifest path fully instruments a diagnosis for a driver that holds facts the product config does not. The authoritative schema lives with the CLI because the CLI parses and validates it, and a floor rendered into either source from the consumer's single source of truth cannot drift from the floor the consumer enforces.

Every reading reaches the pipeline through an injected runner so classification, the fold, and the report verify over controlled readings without a real process, filesystem, or repository, and without mocking. A check that shells out to a runtime surface — an `spx` subcommand, `git`, or a plugin CLI — reaches it through the same injected boundary, so a missing surface yields a controlled not-applicable reading rather than an unhandled error.

## Invariants

- Classification is total and deterministic: every reading set maps to exactly one verdict in its check's table, and identical readings with an identical manifest always produce identical per-check verdicts and the same overall verdict.
- The overall fold is total: it reduces any set of per-check buckets to one overall verdict by the fixed precedence, and yields healthy when every check is not-applicable.
- The exit code is a total function of the overall verdict, independent of which checks ran.
- Every consumer-varying fact the pipeline judges against originates from a supplied manifest, the `spx.config` diagnose section, or a per-check safe default — never baked into the CLI.

## Verification

### Audit

- ALWAYS: the `diagnose` command domain is composed per [`spx/14-cli-composition.adr.md`](../14-cli-composition.adr.md) — pure classification and fold logic in `src/domains/diagnose/`, reading-gathering orchestration in `src/commands/diagnose/`, and the Commander descriptor carrying the exit-code mapping and `--manifest` / `--format` parsing in `src/interfaces/cli/diagnose.ts` ([audit])
- ALWAYS: every reading — PATH resolution, a tool version, an environment variable, a `git` or `spx` subcommand result, a plugin-CLI result, a filesystem probe — is obtained through a dependency-injected runner parameter, so classification and the fold verify over controlled readings ([audit])
- ALWAYS: each check is a pure verdict function from its gathered readings to a record carrying the verdict, its bucket, the readings verbatim, and a remediation hint, independently testable in isolation ([audit])
- ALWAYS: a supplied manifest is parsed and validated at the boundary into a typed contract, and a manifest that selects a check without that check's required consumer facts is rejected ([audit])
- ALWAYS: the spx-version floor, marketplace identity, expected plugin set, and check set the pipeline judges against resolve by the precedence supplied manifest, then `spx.config` diagnose section, then per-check safe defaults, per [`spx/54-diagnose.enabler/11-invocation-modes.pdr.md`](11-invocation-modes.pdr.md) ([audit])
- ALWAYS: a check whose runtime surface is absent yields a not-applicable reading through the injected boundary rather than aborting the pipeline ([audit])
- NEVER: any stage of the pipeline — gather, classify, fold, or emit — consults a language model; every verdict comes from a fixed table and the overall verdict from the fixed precedence broken > unknown > degraded > healthy ([audit])
- NEVER: the `spx` CLI hard-codes a consumer's spx-version floor, marketplace identity, expected plugin set, or check set ([audit])
- NEVER: a module under `src/domains/diagnose/` performs process, git, or filesystem access directly, or imports from `src/commands/` or `src/interfaces/cli/` — the dependency direction follows [`spx/14-cli-composition.adr.md`](../14-cli-composition.adr.md) ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or `memfs` substitutes for the process, git, or filesystem boundary — tests inject controlled runners and exercise the real classification, fold, and report code paths ([audit])
