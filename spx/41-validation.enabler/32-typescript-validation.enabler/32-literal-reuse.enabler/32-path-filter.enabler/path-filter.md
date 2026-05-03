# Path Filter

PROVIDES the validation-class file scoping for the literal-reuse walker — composes `[artifactDirectoryLayer, hiddenPrefixLayer]` from [`17-file-inclusion.enabler`](../../../../17-file-inclusion.enabler/file-inclusion.md) and applies the `validation.paths.{exclude,include}` prefix filter from `spx.config.*` to the walker's resolved scope
SO THAT [21-detection.enabler](../21-detection.enabler/detection.md) walking the project for indexable files
CAN exclude paths an operator has marked as out-of-scope for validation tools without consulting `spx/EXCLUDE` (which governs spec-tree node status, not validation-tool path filtering, per [`11-ignore-defaults.pdr.md`](../../../../17-file-inclusion.enabler/11-ignore-defaults.pdr.md))

## Assertions

### Scenarios

- Given `validation.paths.exclude` lists a path prefix, when the detector walks files, then files whose relative path starts with that prefix are not parsed or indexed ([test](tests/path-filter.scenario.l1.test.ts))
- Given `validation.paths.include` lists a path prefix, when the detector walks files, then only files whose relative path starts with at least one include prefix are parsed and indexed ([test](tests/path-filter.scenario.l1.test.ts))
- Given a node directory listed in `spx/EXCLUDE` but not listed in `validation.paths.exclude`, when the detector walks files, then files under that node's directory are parsed and indexed normally ([test](tests/path-filter.scenario.l1.test.ts))

### Compliance

- ALWAYS: `validation.paths.exclude` suppresses files by path prefix — files under every listed prefix are never parsed and contribute no occurrences ([test](tests/path-filter.compliance.l1.test.ts))
- NEVER: consult `spx/EXCLUDE` during literal-reuse detection — the ignore-source mechanism applies only to spec-tree quality-gate walkers, not to validation commands ([review](../../../../17-file-inclusion.enabler/11-ignore-defaults.pdr.md))
