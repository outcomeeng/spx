---
id: 01931c2a-6e7b-7c4d-9a1f-3b2e8d5f6a70
malleability: verification
---

# Quick Add

PROVIDES capture of a task from one line of natural text, including a due date when the text names one
SO THAT every interface and surface that captures tasks
CAN record a task without leaving what they were doing

## Assertions

### Scenarios

- Given the text "buy milk tomorrow", when it is captured, then a task titled "buy milk" exists with tomorrow's date ([test](tests/capture.scenario.l1.test.{ext}))
- Given text with no date, when it is captured, then the task has no due date and no error ([test](tests/capture.scenario.l1.test.{ext}))

### Mappings

- Relative date words map to dates: "today", "tomorrow", and weekday names resolve against the capture time ([test](tests/dates.mapping.l1.test.{ext}))

### Properties

- Capture is idempotent on its parsed form: capturing the parsed title and date again produces an equal task ([test](tests/capture.property.l1.test.{ext}))

### Compliance

- ALWAYS: every capture emits the `task_captured` event the capture-rate source reads — the outcome record's condition is unreadable without it ([test](tests/events.compliance.l1.test.{ext}))
- ALWAYS: a person captures a task from the quick-add field within two seconds of focusing it ([probe](probes/capture-basic/probe.md))
- NEVER: the parser stores the raw text beyond the capture — the task is the record ([audit:raw-text-retention])
