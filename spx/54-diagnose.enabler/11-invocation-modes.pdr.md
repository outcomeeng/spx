# Diagnose Invocation Modes

`spx diagnose` inspects the local spx environment and reports per-check and overall health. With no output selector it renders a concise human diagnosis that identifies the executing SPX version, the overall verdict, and checks requiring action; `--verbose` renders every selected check and its readings, and `--json` renders the complete structured report. A `--manifest <path>` selects an orthogonal, fully-instrumented input mode in which the caller supplies the complete diagnostic facts — the spx-version floor, marketplace identity, expected plugins, methodology source and version, and check set — to pin and override the diagnosis precisely.

## Rationale

A diagnostic command runs on demand and reports actionable health, the way `/doctor` does. Concise output keeps the routine invocation immediately scannable, while detailed human and complete machine projections preserve every diagnostic fact when the consumer requests them. Resolving diagnostic inputs from the product's own `spx.config` and deterministic per-check defaults keeps invocation zero-friction and consistent with how every spx command reads configuration. The manifest mode serves a caller — a plugin or CI driver — that pins the exact facts the diagnosis judges against, beyond what the product configuration holds, without changing how the resulting report is presented.

## Product properties

1. `spx diagnose` defaults to a concise human diagnosis; `--verbose` selects the detailed human diagnosis and `--json` selects the complete structured report.
2. Output selection changes only presentation: every projection describes the same provider results, overall verdict, remediation, and exit status.
3. Each check judges against facts resolved from a complete `--manifest`, then `spx.config`, then its deterministic fallback; a manifest takes precedence over configuration and defaults.

## Verification

### Testing

- ALWAYS: `spx diagnose` with no output selector renders a concise human diagnosis that identifies the executing SPX version, reports the overall verdict, summarizes checks requiring action, and points to `--verbose` and `--json` without rendering raw readings ([compliance])
- ALWAYS: output selection maps no selector to concise human text, `--verbose` to detailed human text, and `--json` to the complete structured report without changing provider execution, classification, folding, remediation, or exit status ([mapping])
- ALWAYS: a `--manifest` supplies the complete diagnostic facts and takes precedence over configuration and per-check defaults ([mapping])
- ALWAYS: absent consumer facts map to deterministic fallbacks — `spx-reachability` judges presence and reports the observed version when no floor exists; `marketplace-install` reports not-applicable when marketplace facts are absent; `methodology-context` uses the top-level methodology defaults; and the check set includes every diagnostic provider in the build when no check set is configured ([mapping])

### Audit

- ALWAYS: the diagnostic facts a configuration-driven run judges against come from the `spx.config` diagnose descriptor under `spx/16-config.enabler`, consistent with the product rule that configuration comes through `spx.config` rather than ad hoc files ([audit])
