# Diagnose Invocation Modes

`spx diagnose` inspects the local spx environment and reports per-check and overall health: run with no arguments, it resolves what each check judges against from `spx.config` and sensible per-check defaults, then renders the report. A `--manifest <path>` adds a second, fully-instrumented mode in which the caller supplies the complete diagnostic facts — the spx-version floor, marketplace identity, expected plugins, and check set — to pin and override the diagnosis precisely.

## Rationale

A diagnostic command is expected to run on demand and report health, the way `/doctor` does; resolving its inputs from the product's own `spx.config` and per-check defaults keeps it zero-friction and consistent with how every spx command reads configuration. The manifest mode serves a caller — a plugin or CI driver — that pins the exact facts the diagnosis judges against, beyond what the product configuration holds.

## Product properties

1. `spx diagnose` with no arguments reports per-check and overall environment health.
2. Each check judges against facts resolved from `spx.config` and per-check defaults, or from a `--manifest` when one is supplied.
3. A `--manifest` carries the complete diagnostic facts and takes precedence over configuration and defaults.

## Verification

### Testing

- ALWAYS: `spx diagnose` with no arguments resolves its diagnostic facts from `spx.config` and per-check defaults and renders the per-check and overall report ([scenario])
- ALWAYS: a `--manifest` supplies the complete diagnostic facts and takes precedence over configuration and per-check defaults ([mapping])
- ALWAYS: each check judges against its resolved facts, using a sensible default where configuration supplies none — `spx-reachability` reports presence and version, `marketplace-install` reports not-applicable ([mapping])

### Audit

- ALWAYS: the diagnostic facts a configuration-driven run judges against come from the `spx.config` diagnose descriptor under `spx/16-config.enabler`, consistent with the product rule that configuration comes through `spx.config` rather than ad hoc files ([audit])
