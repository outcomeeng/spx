# Verdict Reader

PROVIDES an audit verdict reader boundary with a command-level file loader and a pure XML parser that returns a fully typed in-memory representation of the verdict document
SO THAT the structural, semantic, and paths stages of `spx audit verify`
CAN operate on typed data rather than raw XML strings, without re-parsing the file

## Assertions

### Scenarios

- Given XML content that is not well-formed, when the parser attempts to parse it with a source label, then parsing fails with an error identifying the source label ([test](tests/verdict-reader.scenario.l1.test.ts))
- Given a file path that does not exist, when the command-level file loader attempts to read it, then it fails with an error naming the missing path ([test](tests/verdict-reader.scenario.l1.test.ts))

### Conformance

- The in-memory representation returned for valid audit verdict XML content conforms to the `AuditVerdict` type: a `header` object containing `spec_node`, `verdict`, and `timestamp` string fields, and a `gates` array of objects each containing `name`, `status`, and `findings` fields ([test](tests/verdict-reader.conformance.l1.test.ts))

### Compliance

- ALWAYS: read and parse the verdict file once; return an immutable typed representation — no re-reads after construction ([audit])
- NEVER: validate schema, semantics, or path existence — those are concerns of downstream stages ([audit])
