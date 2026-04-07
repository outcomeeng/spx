# Markdown Validation

WE BELIEVE THAT `spx validation markdown` validates link integrity and structural quality of markdown files in `spx/` and `docs/`
WILL spec authors validate cross-reference integrity and structural quality as part of every commit
CONTRIBUTING TO spec tree link integrity with automated enforcement across `spx/` and `docs/`

## Assertions

### Scenarios

- Given a markdown file with a valid relative link to an existing file, when validation runs, then no error is reported for that link ([test](tests/markdown-validation.unit.test.ts))
- Given a markdown file with a relative link to a non-existent file, when validation runs, then an error is reported identifying the file, line number, and broken target ([test](tests/markdown-validation.unit.test.ts))
- Given a markdown file with a valid heading fragment reference (e.g., `./file.md#heading`), when validation runs, then no error is reported ([test](tests/markdown-validation.unit.test.ts))
- Given a markdown file with a heading fragment referencing a non-existent heading, when validation runs, then an error is reported ([test](tests/markdown-validation.unit.test.ts))
- Given a markdown file with a project-absolute link (e.g., `/spx/foo.md`), when validation runs, then the link resolves relative to the project root ([test](tests/markdown-validation.integration.test.ts))
- Given `spx/` and `docs/` directories exist, when `spx validation markdown` runs with no arguments, then both directories are validated ([test](tests/markdown-validation.integration.test.ts))
- Given `--files spx/` is passed, when validation runs, then only the specified directory is validated ([test](tests/markdown-validation.integration.test.ts))
- Given `spx validation all` runs, then markdown validation executes as a step and its failure fails the pipeline ([test](tests/markdown-validation.integration.test.ts))
- Given `spx/` contains duplicate sibling headings, when validation runs, then MD024 errors are reported for the sibling duplicates ([test](tests/markdown-validation.unit.test.ts))
- Given `spx/` contains the same heading under different parent sections, when validation runs, then no MD024 error is reported ([test](tests/markdown-validation.unit.test.ts))
- Given `docs/` contains duplicate sibling headings, when validation runs, then no MD024 errors are reported ([test](tests/markdown-validation.unit.test.ts))
- Given `docs/` contains other markdown errors, when validation runs, then those non-MD024 errors are still reported ([test](tests/markdown-validation.unit.test.ts))
- Given a user runs `spx validation markdown`, then the command is registered and executes markdown validation ([test](tests/markdown-validation.e2e.test.ts))
- Given a user runs `spx validation markdown` on a directory with a broken link, then the process exits with code 1 and the error output identifies the broken link ([test](tests/markdown-validation.e2e.test.ts))
- Given `spx/EXCLUDE` lists a node path, when validation runs, then markdown files in that node directory are skipped ([test](tests/markdown-validation.unit.test.ts))
- Given a declared-state node has `[test]` links to files that do not exist yet, when that node is listed in `spx/EXCLUDE`, then those broken links are not reported ([test](tests/markdown-validation.unit.test.ts))

### Mappings

- Link type resolution: relative link (`./foo.md`) resolves from the file's directory; project-absolute link (`/spx/foo.md`) resolves from the project root via `root_path` config; external URL (`https://...`) is not checked; HTML link (`<a href="...">`) is not checked ([test](tests/markdown-validation.unit.test.ts), [test](tests/markdown-validation.integration.test.ts))
- Enabled built-in rules: MD001 (heading increment), MD003 (heading style), MD009 (no trailing spaces), MD010 (no hard tabs), MD024 (no duplicate headings — `siblings_only` for `spx/`, disabled for `docs/`), MD025 (single top-level heading), MD047 (file ends with newline). All other built-in rules are disabled ([test](tests/markdown-validation.unit.test.ts))

### Compliance

- ALWAYS: broken links fail `spx validation all` — markdown link integrity gates commits alongside ESLint and TypeScript ([test](tests/markdown-validation.integration.test.ts))
- ALWAYS: markdown validation is available in every `spx` installation — no optional dependency, no runtime discovery, no skip path ([enforce](../../../package.json))
- ALWAYS: validation produces no side effects in validated directories — no config files, no generated artifacts ([test](tests/markdown-validation.unit.test.ts))
- NEVER: validate directories outside `spx/` and `docs/` by default — these are the well-known spec tree directories coupled to Claude skills ([test](tests/markdown-validation.unit.test.ts))
