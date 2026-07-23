# Diagnose

PROVIDES the `spx diagnose` command — a deterministic environment-diagnostics pipeline that invokes each resolved diagnostic provider, gathers each provider's check readings, classifies them against fixed verdict tables, folds the per-check verdicts into one overall verdict, and emits a per-check and overall report in text or JSON with a process exit code keyed to that verdict, resolving the facts each provider judges against from `spx.config` and per-check defaults, or from an explicit `--manifest` that fully instruments the diagnosis, per `spx/54-diagnose.enabler/11-invocation-modes.pdr.md` and `spx/54-diagnose.enabler/31-composable-diagnostics.pdr.md`
SO THAT a spec-tree product and the agents working it, consuming spx as a trusted third party
CAN deterministically self-diagnose a misconfigured environment by running `spx diagnose` with no arguments, without re-deriving the classification on every invocation

## Assertions

### Scenarios

- Given a `diagnose` section in `spx.config` and no `--manifest`, when `spx diagnose` runs, it resolves the diagnostic facts from configuration and emits a schema-valid report keyed to the overall verdict ([test](tests/diagnose-cli.scenario.l2.test.ts))
- Given no `--manifest` and no `diagnose` configuration, when `spx diagnose` runs, each check reports against its per-check default and the report renders keyed to the overall verdict ([test](tests/diagnose-cli.scenario.l2.test.ts))
- Given a `--manifest`, when `spx diagnose` runs, it judges against the manifest's facts and emits a schema-valid report in the requested format keyed to the overall verdict ([test](tests/diagnose-cli.scenario.l2.test.ts))

### Mappings

- The overall verdict folds the per-check verdicts by the precedence broken > unknown > degraded > healthy, excluding not-applicable, and is healthy when every check is not-applicable ([test](tests/fold.mapping.l1.test.ts))
- The process exit code maps the overall verdict — healthy to 0, degraded to 1, unknown to 2, broken to 3 ([test](tests/exit-code.mapping.l1.test.ts))
- The pipeline runs exactly the resolved diagnostic provider set — the selected checks — in the order the resolved facts supply it ([test](tests/check-selection.mapping.l1.test.ts))

### Conformance

- A manifest parses to the typed contract carrying the spx-version floor, the marketplace identity, the expected plugin set, and the check set; a manifest naming a check this build does not provide, or selecting a check without that check's required consumer facts, is rejected ([test](tests/manifest.conformance.l1.test.ts))
- The JSON report conforms to the report schema — a per-check record carrying the check name, verdict, bucket, the gathered readings verbatim, and a remediation hint, plus the overall verdict ([test](tests/report.conformance.l1.test.ts))

### Properties

- Classification is deterministic — identical readings and manifest always produce identical per-check verdicts and the same overall verdict ([test](tests/determinism.property.l1.test.ts))

### Compliance

- ALWAYS: the JSON report carries the complete per-check schema for machines, while the text report translates the same check records into a human diagnosis: a conclusion, the active problems, the useful healthy facts, and concrete next actions without raw boolean fields or duplicated verdict/bucket labels ([test](tests/text-report.compliance.l1.test.ts))
- ALWAYS: the text report renders through the `spx/13-cli.enabler/21-styled-output.enabler` primitive — each diagnosis line carries the status glyph keyed by the check's bucket and the diagnosis line is colored by the overall verdict's severity ([test](tests/text-report.compliance.l1.test.ts))
- ALWAYS: user-supplied bytes a diagnose error echoes — the manifest path and the manifest-named checks — are sanitized before the diagnostic echo, per `spx/13-cli.enabler/cli.md` ([test](tests/error-sanitization.compliance.l2.test.ts))
- ALWAYS: every externally-originated check reading the text report renders — a resolved path, a subprocess version reading, a configured source — carries its terminal-control bytes escaped, while the JSON report keeps the same readings verbatim for machine consumers ([test](tests/reading-escaping.compliance.l1.test.ts))
- ALWAYS: a reading the text report needs but the check did not gather renders as the source-owned undefined sentinel rather than an interpolated `undefined` ([test](tests/reading-escaping.compliance.l1.test.ts))
