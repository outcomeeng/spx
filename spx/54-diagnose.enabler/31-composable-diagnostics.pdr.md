# Composable Diagnostic Providers

`spx diagnose` is the whole-product diagnostic command, and each diagnosable product domain owns a focused diagnostic provider for its own concern. The whole-product command invokes those providers and includes their diagnoses in one report and one overall verdict, so users can diagnose the whole environment without receiving conclusions that contradict the owning domain.

## Rationale

Users need one whole-environment answer whose per-domain conclusions stay owned by the domains that understand those concerns. Reusing each focused diagnostic provider inside the whole-product report keeps the aggregate report consistent with the owning domain.

## Product properties

1. Users can run `spx diagnose` to receive one report that includes every resolved domain diagnostic provider's diagnosis.
2. A diagnosable domain's focused diagnostic provider returns the same conclusion and next action that `spx diagnose` includes for that domain.
3. Users receive one overall verdict from `spx diagnose` even when multiple focused domain diagnoses contribute to the report.

## Verification

### Testing

- ALWAYS: `spx diagnose` invokes every resolved domain diagnostic provider and folds their verdicts into one overall verdict ([mapping])
- ALWAYS: a focused domain diagnostic provider reports the same conclusion and next action that `spx diagnose` includes for that domain under the same inputs ([property])
- NEVER: `spx diagnose` reports a domain conclusion that contradicts the focused diagnostic provider for the same domain and inputs ([compliance])

### Audit

- ALWAYS: a diagnosable domain's spec or decision records declare the focused diagnostic provider behavior that `spx/54-diagnose.enabler` includes in the whole-product report ([audit])
