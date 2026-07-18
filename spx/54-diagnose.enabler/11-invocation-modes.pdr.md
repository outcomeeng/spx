# Diagnose Invocation Modes

`spx diagnose` inspects the addressed product's SPX and agent-harness environment and reports per-check and overall health. With no output selector it renders a concise human diagnosis that identifies the executing SPX version, the overall verdict, and checks requiring action; `--verbose` renders every selected check and its readings, and `--json` renders the complete structured report. A `--manifest <path>` selects an orthogonal pinned-input mode for caller-overridable facts and check selection, while product-owned harness-environment facts always resolve from the addressed checkout.

## Rationale

A diagnostic command reports the health of the product it addresses. Caller-supplied version and methodology constraints can be pinned through a manifest, while marketplace and plugin requirements remain product intent declared through `harnessEnvironment` configuration. Keeping product-owned facts anchored to the checkout prevents a plugin-shipped manifest from replacing one product's configured plugin subset with the marketplace's complete catalog.

## Product properties

1. `spx diagnose` defaults to a concise human diagnosis; `--verbose` selects the detailed human diagnosis and `--json` selects the complete structured report.
2. Output selection changes only presentation: every projection describes the same provider results, overall verdict, remediation, and exit status.
3. Caller-overridable facts resolve from a supplied manifest before `spx.config` and deterministic fallbacks, while harness-environment facts always resolve from the addressed product's `spx.config`.

## Verification

### Testing

- ALWAYS: `spx diagnose` with no output selector renders a concise human diagnosis that identifies the executing SPX version, reports the overall verdict, summarizes checks requiring action, and points to `--verbose` and `--json` without rendering raw readings ([compliance])
- ALWAYS: output selection maps no selector to concise human text, `--verbose` to detailed human text, and `--json` to the complete structured report without changing provider execution, classification, folding, remediation, or exit status ([mapping])
- ALWAYS: a `--manifest` supplies its selected check set and the caller-overridable facts those checks require, taking precedence over the diagnose descriptor and per-check fallbacks for those facts ([mapping])
- ALWAYS: plugin-bootstrap and marketplace-install facts resolve from the addressed product's `harnessEnvironment` configuration in both config-driven and manifest-driven invocations ([mapping])
- ALWAYS: absent caller-overridable facts map to deterministic fallbacks — `spx-reachability` judges presence and reports the observed version when no floor exists; `methodology-context` uses the top-level methodology defaults; and the check set includes every diagnostic provider in the build when no check set is configured ([mapping])

### Audit

- ALWAYS: configuration-driven diagnostic facts come through registered `spx.config` descriptors rather than ad hoc files ([audit])
- NEVER: a manifest overrides product-owned agent, marketplace, plugin, or skill intent resolved from `harnessEnvironment` configuration ([audit])
