# Diagnose

PROVIDES the `spx diagnose` command — a deterministic environment-diagnostics pipeline that invokes each resolved diagnostic provider, gathers each provider's check readings, classifies them against fixed verdict tables, folds the per-check verdicts into one overall verdict, and produces a typed report with a process exit code keyed to that verdict, resolving the facts each provider judges against from `spx.config` and per-check defaults, or from an explicit `--manifest` that fully instruments the diagnosis, per `spx/54-diagnose.enabler/11-invocation-modes.pdr.md` and `spx/54-diagnose.enabler/31-composable-diagnostics.pdr.md`
SO THAT a spec-tree product and the agents working it, consuming spx as a trusted third party
CAN deterministically self-diagnose a misconfigured environment by running `spx diagnose` with no arguments, without re-deriving the classification on every invocation

## Assertions

### Scenarios

- Given a `diagnose` section in `spx.config` and no `--manifest`, when `spx diagnose` runs, it resolves the diagnostic facts from configuration and emits a schema-valid report keyed to the overall verdict ([test](71-diagnose-cli.enabler/tests/diagnose-cli.scenario.l2.test.ts))
- Given no `--manifest` and no `diagnose` configuration, when `spx diagnose` runs, each check reports against its per-check default and the report renders keyed to the overall verdict ([test](71-diagnose-cli.enabler/tests/diagnose-cli.scenario.l2.test.ts))

### Mappings

- The overall verdict folds the per-check verdicts by the precedence broken > unknown > degraded > healthy, excluding not-applicable, and is healthy when every check is not-applicable ([test](tests/fold.mapping.l1.test.ts))
- The pipeline runs exactly the resolved diagnostic provider set — the selected checks — in the order the resolved facts supply it ([test](tests/check-selection.mapping.l1.test.ts))

### Conformance

- A manifest parses to the typed contract carrying the spx-version floor, the marketplace identity, the expected plugin set, the methodology source and version, and the check set; a manifest naming a check this build does not provide, or selecting a check without that check's required consumer facts — including `methodology-context` without methodology source and version — is rejected ([test](tests/manifest.conformance.l1.test.ts))
- The JSON report conforms to the report schema — a per-check record carrying the check name, verdict, bucket, the gathered readings verbatim, and a remediation hint, plus the overall verdict ([test](tests/report.conformance.l1.test.ts))

### Properties

- Classification is deterministic — identical readings and manifest always produce identical per-check verdicts and the same overall verdict ([test](tests/determinism.property.l1.test.ts))
