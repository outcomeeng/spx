# Path Filter

PROVIDES the validation-class file scoping for the literal-reuse walker — composes the git-tracking layer from [`17-file-inclusion.enabler`](../../../../17-file-inclusion.enabler/file-inclusion.md) and applies the `validation.paths.{exclude,include}` prefix filter from `spx.config.*` to the walker's resolved scope
SO THAT [21-detection.enabler](../21-detection.enabler/detection.md) walking the project for indexable files
CAN exclude entries git considers ignored under the working tree and entries an operator has marked as out-of-scope for validation through `validation.paths`, while including dot-prefixed product content under `.github/`, `.changeset/`, `.husky/`, and similar paths by default per [`11-ignore-defaults.pdr.md`](../../../../17-file-inclusion.enabler/11-ignore-defaults.pdr.md)

## Assertions

### Scenarios

- Given `validation.paths.exclude` lists a path prefix, when the detector walks files, then files whose relative path starts with that prefix are not parsed or indexed ([test](tests/path-filter.scenario.l1.test.ts))
- Given `validation.paths.include` lists a path prefix, when the detector walks files, then only files whose relative path starts with at least one include prefix are parsed and indexed ([test](tests/path-filter.scenario.l1.test.ts))
- Given a path is matched by `.gitignore`, nested `.gitignore`, `.git/info/exclude`, or global gitignore, when the detector walks files, then files under that path are not parsed or indexed and the decision trail names the git-tracking layer ([test](tests/path-filter.scenario.l1.test.ts))
- Given a file lives under a dot-prefixed directory (`.github/`, `.changeset/`, `.husky/`, `.devcontainer/`) that git does not ignore, when the detector walks files, then the file is parsed and indexed normally ([test](tests/path-filter.scenario.l1.test.ts))

### Compliance

- ALWAYS: `validation.paths.exclude` suppresses files by path prefix — files under every listed prefix are never parsed and contribute no occurrences ([test](tests/path-filter.compliance.l1.test.ts))
- ALWAYS: entries git considers ignored under the working tree are excluded from the walker's scope without requiring restatement in `validation.paths.exclude` — the git-tracking layer is the single default scope source per [`11-ignore-defaults.pdr.md`](../../../../17-file-inclusion.enabler/11-ignore-defaults.pdr.md) ([test](tests/path-filter.compliance.l1.test.ts))
- NEVER: compose an artifact-directory list or hidden-prefix rule inside the literal-reuse walker — the git-tracking layer subsumes both per [`11-ignore-defaults.pdr.md`](../../../../17-file-inclusion.enabler/11-ignore-defaults.pdr.md) ([review](../../../../17-file-inclusion.enabler/11-ignore-defaults.pdr.md))
