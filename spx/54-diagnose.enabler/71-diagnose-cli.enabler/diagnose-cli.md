# Diagnose CLI

PROVIDES the `spx diagnose` command grammar and report presentation — concise human output by default, detailed human output under `--verbose`, and complete machine output under `--json`
SO THAT practitioners, coding agents, and automation diagnosing an SPX product environment
CAN identify the executing SPX version and actionable health immediately, inspect every diagnostic fact when needed, or consume a stable structured report

## Assertions

### Scenarios

- Given no output selector, when `spx diagnose` runs, then concise human output identifies the executing SPX version, reports the overall verdict, summarizes checks requiring action, and points to the detailed and machine-readable modes without rendering raw readings ([test](tests/diagnose-cli.scenario.l2.test.ts))
- Given `--verbose`, when `spx diagnose` runs, then detailed human output reports every selected check, its provider-owned readings, useful healthy facts, conclusion, and remediation ([test](tests/diagnose-cli.scenario.l2.test.ts))
- Given `--manifest <path>` with any valid output mode, when `spx diagnose` runs, then it judges against the manifest facts and emits the selected presentation keyed to the overall verdict ([test](tests/diagnose-cli.scenario.l2.test.ts))

### Mappings

- Output selection maps no selector to concise human text, `--verbose` to detailed human text, and `--json` to the complete schema-valid JSON report; the selected output mode changes no provider execution, classification, folding, remediation, or exit status ([test](tests/output-mode.mapping.l2.test.ts))
- The process exit code maps the overall verdict — healthy to 0, degraded to 1, unknown to 2, broken to 3 ([test](tests/exit-code.mapping.l1.test.ts))
- Every verdict bucket maps a human diagnosis heading to the styled-output glyph for that bucket's severity ([test](tests/styled-output.mapping.l1.test.ts))
- Every overall verdict maps the human diagnosis summary to the styled-output color for that verdict's severity ([test](tests/styled-output.mapping.l1.test.ts))

### Compliance

- ALWAYS: the human report renders through the `spx/13-cli.enabler/21-styled-output.enabler` primitive ([audit])
- ALWAYS: detailed human output escapes terminal-control bytes in provider reading names and values while JSON output preserves those readings verbatim ([test](tests/verbose-reading-sanitization.compliance.l1.test.ts))
- NEVER: accept `--verbose` together with `--json`, or accept `--format`; invalid output options fail with a sanitized diagnostic before diagnosis runs ([test](tests/error-sanitization.compliance.l2.test.ts))
