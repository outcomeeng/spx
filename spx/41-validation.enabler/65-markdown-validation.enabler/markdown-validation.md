---
malleability: spec
---

# Markdown Validation

PROVIDES markdownlint-cli2-based link integrity and structural quality checking for markdown files in `spx/` and `docs/`
SO THAT `spx validation all` and `spx validation markdown`
CAN catch broken cross-references and structural defects before they reach the repository

## Assertions

- A product spec carries no required opening, every ADR and PDR carries its decision statement — the first prose paragraph after its title — at every methodology version, and every output-node spec carries the opening resolved from its registered kind or parent kind.
- Context-renderable Markdown fails validation when an ADR or PDR has no decision statement, a required output-node opening is absent or malformed, an admitted output-node kind has no resolvable opening, front matter is malformed, an explicit `malleability` value is unsupported, strict UTF-8 decoding fails, a Markdown decision citation is unresolved, or an outcome-record filename differs from its owning node slug.

### Scenarios

- Given a markdown file with a valid relative link to an existing file, when validation runs, then no error is reported for that link ([test](tests/markdown-validation.scenario.l1.test.ts))
- Given a markdown file with a relative link to a non-existent file, when validation runs, then an error is reported identifying the file, line number, and broken target ([test](tests/markdown-validation.scenario.l1.test.ts))
- Given a markdown file with a valid heading fragment reference (e.g., `./file.md#heading`), when validation runs, then no error is reported ([test](tests/markdown-validation.scenario.l1.test.ts))
- Given a markdown file with a heading fragment referencing a non-existent heading, when validation runs, then an error is reported ([test](tests/markdown-validation.scenario.l1.test.ts))
- Given `spx/` and `docs/` directories exist, when `spx validation markdown` runs with no arguments, then both directories are validated ([test](tests/markdown-validation-command.scenario.l2.test.ts))
- Given `spx/` is supplied as a positional operand, when validation runs, then only the specified directory is validated ([test](tests/markdown-validation-command.scenario.l2.test.ts))
- Given `spx validation all` runs, then markdown validation executes as a step and its failure fails the pipeline ([test](tests/markdown-validation-command.scenario.l2.test.ts))
- Given `spx/` contains duplicate sibling headings, when validation runs, then MD024 errors are reported for the sibling duplicates ([test](tests/markdown-validation.scenario.l1.test.ts))
- Given `spx/` contains the same heading under different parent sections, when validation runs, then no MD024 error is reported ([test](tests/markdown-validation.scenario.l1.test.ts))
- Given `docs/` contains duplicate sibling headings, when validation runs, then no MD024 errors are reported ([test](tests/markdown-validation.scenario.l1.test.ts))
- Given `docs/` contains other markdown errors, when validation runs, then those non-MD024 errors are still reported ([test](tests/markdown-validation.scenario.l1.test.ts))
- Given a user runs `spx validation markdown`, then the command is registered and executes markdown validation ([test](tests/markdown-validation-command.scenario.l2.test.ts))
- Given a user runs `spx validation markdown` on a directory with a broken link, then the process exits with code 1 and the error output identifies the broken link ([test](tests/markdown-validation-command.scenario.l2.test.ts))
- Given `spx/EXCLUDE` lists a node path, when validation runs, then direct markdown files in that node directory are skipped while child-node markdown files remain in scope ([test](tests/markdown-validation.scenario.l1.test.ts))
- Given a declared-state node has `[test]` links to files that do not exist yet, when that node is listed in `spx/EXCLUDE`, then those broken links in the node's direct markdown files are not reported ([test](tests/markdown-validation.scenario.l1.test.ts))
- Given repository `spx/EXCLUDE` lists markdown-skipped nodes, when markdown validation runs against `spx/` with node-status excludes disabled, then the listed nodes equal the direct spec-node markdown failures exposed by that run ([test](tests/markdown-validation.scenario.l1.test.ts))
- Given a directory scope contains a broken `.markdown` file and no broken `.md` file, when validation runs on the directory, then no error is reported for the `.markdown` file; when validation runs on that direct `.markdown` file, then the broken link is reported ([test](tests/markdown-validation.scenario.l1.test.ts))
- Given a file scope contains a missing markdown file path, when `spx validation markdown` runs with that path as a positional operand, then the command reports the skipped scope in output and exits 0 when no markdown target remains ([test](tests/markdown-validation-command.scenario.l2.test.ts))
- Given a file scope contains a path that is neither an existing directory nor a markdown file, when `spx validation markdown` runs with that path as a positional operand, then the command reports the skipped scope in output and exits 0 when no markdown target remains ([test](tests/markdown-validation-command.scenario.l2.test.ts))
- Given file scope contains both a valid markdown target and an unrelated file, when `spx validation markdown` runs with those paths as positional operands, then validation runs for the markdown target and the skipped unrelated file is reported in output ([test](tests/markdown-validation-command.scenario.l2.test.ts))
- Given a markdown file path contains a colon, when markdownlint reports an error for that file, then markdown validation reports the file, line number, and rule detail instead of dropping the error ([test](tests/markdown-validation.scenario.l1.test.ts))
- Given a validated markdown directory, when validation runs, then its file set remains unchanged with no config files or generated artifacts added ([test](tests/markdown-validation.scenario.l1.test.ts))
- Given a markdown file inside `spx/` with a tree-absolute link (e.g., `spx/foo.md`), when `spx validation markdown` runs, then the link resolves from the product root ([test](tests/markdown-validation.scenario.l1.test.ts))

### Mappings

- Enabled built-in rules: MD001 (heading increment), MD003 (heading style), MD009 (no trailing spaces), MD010 (no hard tabs), MD024 (no duplicate headings — `siblings_only` for `spx/`, disabled for `docs/`), MD025 (single top-level heading), MD047 (file ends with newline). All other built-in rules are disabled ([test](tests/markdown-validation.mapping.l1.test.ts))
- Markdown full-pipeline participation defaults to run ([test](tests/markdown-validation.mapping.l1.test.ts))
- Link type resolution for command behavior: inside `spx/`, a tree-absolute link (`spx/foo.md`) resolves from the product root; in `docs/`, a product-absolute link (`/spx/foo.md`) resolves from the product root ([test](tests/markdown-validation.mapping.l1.test.ts))
- Link type resolution for local rule behavior: inside `spx/`, a node-local relative link (`tests/foo.md`) resolves from the citing file's directory to a target inside the citing node; in `docs/`, a relative link (`./foo.md`) resolves from the file's directory; an external URL (`https://...`) is not checked; an HTML link (`<a href="...">`) is not checked ([test](tests/markdown-validation.mapping.l1.test.ts))

### Compliance

- ALWAYS: broken links fail `spx validation all` ([test](tests/markdown-validation.compliance.l1.test.ts))
- ALWAYS: markdown validation is available in every `spx` installation — no optional dependency, no runtime discovery, no skip path ([audit])
- NEVER: validate directories outside `spx/` and `docs/` by default — these are the well-known spec tree directories coupled to Claude skills ([test](tests/markdown-validation.compliance.l1.test.ts))
- ALWAYS: inside `spx/`, a link with a `../` climb, a link with a leading-slash anchor, a relative link whose path enters a descendant node's directory, and a link whose href separates path segments with a backslash, written raw or as `%5C`, each fail markdown validation, naming the file, the line, and the link ([test](tests/markdown-validation.compliance.l1.test.ts))
- ALWAYS: inside `spx/`, an assertion evidence link — a link whose text is `test`, `eval`, or `probe` — whose href is tree-absolute fails markdown validation, naming the file, the line, and the link, whether or not its target resolves to a tracked file; a tree-absolute link with any other text is admitted ([test](tests/markdown-validation.compliance.l1.test.ts))
- ALWAYS: when the product root is a git repository, a link inside `spx/` that resolves to no file git tracks fails markdown validation as a broken link ([test](tests/markdown-validation.compliance.l1.test.ts))
- ALWAYS: inside `spx/`, a decision path — a path that begins `spx/`, ends in `.adr.md` or `.pdr.md`, and resolves to a decision tracked in the product — written as text outside a link, bare or in an inline code span, fails markdown validation, naming the file, the line, and the path; a decision filename without the `spx/` prefix, an `spx/` path that resolves to no tracked decision, and a decision path inside a fenced code block are not checked ([test](tests/markdown-validation.compliance.l1.test.ts))
