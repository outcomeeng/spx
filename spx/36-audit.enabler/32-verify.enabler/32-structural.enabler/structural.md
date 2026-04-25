# Structural

PROVIDES structural validation of a parsed audit verdict — checks required elements are present, gate status values are within the allowed enumeration (`PASS`, `FAIL`, `SKIPPED`), the overall verdict is within the allowed enumeration (`APPROVED`, `REJECT`), and finding counts match the number of finding elements
SO THAT the semantic and paths stages
CAN trust they are operating on a well-formed verdict with no missing fields or illegal enum values

## Assertions

### Scenarios

- Given a verdict missing the `<header>` element, when structural validation runs, then it reports a "missing required element" defect ([test](tests/structural.scenario.l1.test.ts))
- Given a verdict with a gate status value outside `PASS|FAIL|SKIPPED`, when structural validation runs, then it reports an "invalid enum value" defect naming the gate and the bad value ([test](tests/structural.scenario.l1.test.ts))
- Given a verdict with an overall verdict value outside `APPROVED|REJECT`, when structural validation runs, then it reports an "invalid enum value" defect ([test](tests/structural.scenario.l1.test.ts))
- Given a verdict where a gate's `count` attribute does not match the number of `<finding>` elements, when structural validation runs, then it reports a "count mismatch" defect ([test](tests/structural.scenario.l1.test.ts))

### Mappings

- Each required element — `<header>`, `<spec_node>` inside `<header>`, `<verdict>` inside `<header>`, `<timestamp>` inside `<header>`, `<gates>`, at least one `<gate>` inside `<gates>` — maps to a named structural check; absence of any maps to a "missing required element" defect ([test](tests/structural.mapping.l1.test.ts))
- Each allowed gate status value (`PASS`, `FAIL`, `SKIPPED`) maps to a valid structural state; any other value maps to a defect ([test](tests/structural.mapping.l1.test.ts))

### Compliance

- NEVER: interpret semantic meaning of gate statuses or overall verdict — only validate presence and enumeration membership ([review])
