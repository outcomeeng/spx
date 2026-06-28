# Composable Diagnostic Commands

`spx diagnose` is the whole-product diagnostic command, and each diagnosable product domain exposes a focused diagnose command for its own concern. The whole-product command includes the focused domain diagnoses in one report and one overall verdict, so users can diagnose the whole environment or one domain without receiving contradictory conclusions.

## Rationale

Users need both a whole-environment answer and a way to inspect one product concern without reading unrelated checks. Reusing the focused domain diagnosis inside the whole-product report keeps the two entry points consistent.

## Product properties

1. Users can run `spx diagnose` to receive one report that includes every resolved domain diagnosis.
2. Users can run a focused diagnose command for a diagnosable domain and receive the same conclusion and next action that `spx diagnose` includes for that domain.
3. Users receive one overall verdict from `spx diagnose` even when multiple focused domain diagnoses contribute to the report.

## Verification

### Testing

- ALWAYS: `spx diagnose` includes every resolved domain diagnosis and folds their verdicts into one overall verdict ([mapping])
- ALWAYS: a focused domain diagnose command reports the same conclusion and next action that `spx diagnose` includes for that domain under the same inputs ([property])
- NEVER: `spx diagnose` reports a domain conclusion that contradicts the focused diagnose command for the same domain and inputs ([compliance])

### Audit

- ALWAYS: a diagnosable domain's spec or decision records declare the focused diagnose behavior that `spx/54-diagnose.enabler` includes in the whole-product report ([audit])
