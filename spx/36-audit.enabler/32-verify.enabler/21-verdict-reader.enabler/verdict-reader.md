# Verdict Reader

PROVIDES an XML parser that reads an audit verdict file from disk and returns a fully typed in-memory representation of the verdict document
SO THAT the structural, semantic, and paths stages of `spx audit verify`
CAN operate on typed data rather than raw XML strings, without re-parsing the file

## Assertions

### Scenarios

- Given a file that is not well-formed XML, when the reader attempts to parse it, then parsing fails with an error identifying the file ([test](tests/verdict-reader.scenario.l1.test.ts))
- Given a file path that does not exist, when the reader attempts to read it, then it fails with an error naming the missing path ([test](tests/verdict-reader.scenario.l1.test.ts))

### Conformance

- The in-memory representation returned for a valid audit verdict XML file conforms to the `AuditVerdict` type: a `header` object containing `spec_node`, `verdict`, and `timestamp` string fields, and a `gates` array of objects each containing `name`, `status`, and `findings` fields ([test](tests/verdict-reader.conformance.l1.test.ts))

### Compliance

- ALWAYS: read and parse the verdict file once; return an immutable typed representation — no re-reads after construction ([review])
- NEVER: validate schema, semantics, or path existence — those are concerns of downstream stages ([review])
