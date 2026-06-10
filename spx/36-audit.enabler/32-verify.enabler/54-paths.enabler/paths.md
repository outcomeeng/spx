# Paths

PROVIDES path validation of a structurally and semantically valid audit verdict — checks that every `<spec_file>` and `<test_file>` path referenced in assertion findings resolves to an existing file under the product directory
SO THAT consumers of `spx audit verify`
CAN trust the verdict's file references point to actual files in the working tree

## Assertions

### Scenarios

- Given a verdict whose assertion findings reference spec and test files that all exist under the product directory, when path validation runs, then no defects are reported ([test](tests/paths.scenario.l1.test.ts))
- Given a verdict with a path that escapes the product directory (e.g., `../../etc/passwd`), when path validation runs, then it reports a "path escapes product directory" defect ([test](tests/paths.scenario.l1.test.ts))

### Mappings

- For each path-bearing element type (`spec_file`, `test_file`), when that element references a path that does not exist under the product directory, then a "missing file" defect naming the path is reported ([test](tests/paths.mapping.l1.test.ts))

### Compliance

- ALWAYS: resolve all paths relative to the product directory ([audit])
- ALWAYS: use the injected file-existence reader to decide missing-file defects ([test](tests/paths.scenario.l1.test.ts))
- NEVER: read, parse, or validate the content of referenced files — only check existence and containment within the product directory ([audit])
