# Value Allowlist

PROVIDES the literal-value suppression layer — `validation.literal.values.{presets,include,exclude}` config in `spx.config.*` resolved into an effective `(kind, value)` set computed once per detection run, with curated preset bundles for common ecosystems
SO THAT [21-detection.enabler](../21-detection.enabler/detection.md) emitting problems for indexed literals
CAN suppress findings for values a project has classified as non-domain (HTTP verbs, framework tokens, ecosystem boilerplate) without re-running config resolution per finding

## Assertions

### Scenarios

- Given `validation.literal.values.include` contains a string value, when the detector runs, then no problem is reported for that value regardless of how many files contain it ([test](tests/value-allowlist.scenario.l1.test.ts))
- Given `validation.literal.values.presets` names a built-in preset, when the detector runs, then all values bundled in that preset produce no problems ([test](tests/value-allowlist.scenario.l1.test.ts))
- Given `validation.literal.values.exclude` names a value that a configured preset would suppress, when the detector runs, then problems for that value are still reported — `exclude` wins over presets ([test](tests/value-allowlist.scenario.l1.test.ts))
- Given no `spx.config.*` file is present at the project root, when the detector runs, then the effective allowlist is empty ([test](tests/value-allowlist.scenario.l1.test.ts))
- Given `validation.literal.values.presets` names an unrecognized preset identifier, when `resolveConfig` validates the section, then it returns an error naming the unrecognized identifier and the detection run does not proceed ([test](tests/value-allowlist.scenario.l1.test.ts))

### Mappings

- The effective allowlist for a detection run equals union(values bundled in each named preset) ∪ `include` \ `exclude` — computed once before any file is walked ([test](tests/value-allowlist.mapping.l1.test.ts))
- Built-in preset identifiers: `"web"` bundles HTTP method names, HTTP header names, common response shape keys, and HTML attribute tokens ([test](tests/value-allowlist.mapping.l1.test.ts))

### Compliance

- ALWAYS: the `spx.config.*` section key for validation configuration is `"validation"`, literal config is nested under `"validation.literal"`, and the literal-value allowlist is nested under `"validation.literal.values"` — no caller outside the config module references these keys as string literals ([review](21-allowlist-config.adr.md))
- ALWAYS: `exclude` removes a value from the effective allowlist regardless of which source contributed it — a value in both `include` and `exclude` is not in the effective allowlist ([test](tests/value-allowlist.compliance.l1.test.ts))
