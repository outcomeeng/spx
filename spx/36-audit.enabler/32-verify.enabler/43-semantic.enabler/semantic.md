# Semantic

PROVIDES semantic validation of a structurally valid audit verdict — checks that gate statuses, finding presence, and overall verdict are internally coherent
SO THAT consumers of `spx audit verify`
CAN trust the verdict is not internally contradictory

## Assertions

### Scenarios

- Given a verdict with overall verdict `APPROVED` and all gates `PASS`, when semantic validation runs, then no defects are reported ([test](tests/semantic.scenario.l1.test.ts))
- Given a verdict with overall verdict `APPROVED` and at least one gate `FAIL`, when semantic validation runs, then it reports an "incoherent verdict" defect ([test](tests/semantic.scenario.l1.test.ts))
- Given a verdict with overall verdict `REJECT` and at least one gate `FAIL`, when semantic validation runs, then no defects are reported ([test](tests/semantic.scenario.l1.test.ts))
- Given a verdict with overall verdict `REJECT` and all gates `PASS`, when semantic validation runs, then it reports an "incoherent verdict" defect ([test](tests/semantic.scenario.l1.test.ts))
- Given a gate with status `FAIL` and zero findings, when semantic validation runs, then it reports a "failed gate has no findings" defect ([test](tests/semantic.scenario.l1.test.ts))
- Given a gate with status `SKIPPED` and no `<skipped_reason>` element, when semantic validation runs, then it reports a "skipped gate missing reason" defect ([test](tests/semantic.scenario.l1.test.ts))

### Mappings

- Each of the six semantically distinct gate-status/verdict combinations maps to coherent or defect:
  1. All gates `PASS` + overall `APPROVED` → coherent
  2. All gates `PASS` + overall `REJECT` → "incoherent verdict" defect
  3. Any gate `FAIL` + overall `REJECT` → coherent
  4. Any gate `FAIL` + overall `APPROVED` → "incoherent verdict" defect
  5. Any gate `SKIPPED`, no gate `FAIL` + overall `REJECT` → coherent
  6. Any gate `SKIPPED`, no gate `FAIL` + overall `APPROVED` → "incoherent verdict" defect
     ([test](tests/semantic.mapping.l1.test.ts))

### Compliance

- NEVER: check path existence or element presence — those are concerns of the paths and structural stages respectively ([review])
