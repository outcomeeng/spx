PROVIDES dprint-based code-formatting verification across the product's TypeScript, JSON, Markdown, TOML, and YAML files
SO THAT `spx validation all` and `spx validation format`
CAN catch unformatted files before they reach the repository, with one verdict reproducible across every worktree, contributor, and CI runner

## Assertions

### Scenarios

- Given a product whose files are all formatted, when `spx validation format` runs, then no problems are reported and it exits 0 ([test](tests/formatting.scenario.l2.test.ts))
- Given a product with an unformatted file, when `spx validation format` runs, then a problem is reported identifying the file and the command exits non-zero ([test](tests/formatting.scenario.l2.test.ts))
- Given `spx validation all` runs, when formatting reports a failure, then the full pipeline reports the formatting failure and exits non-zero ([test](tests/formatting.scenario.l2.test.ts))
- Given a user runs `spx validation format` on a product with an unformatted file, then the process exits non-zero and the output identifies the file ([test](tests/formatting.scenario.l2.test.ts))
- Given a product with a `.gitignore`d unformatted file, when `spx validation format` runs, then no problem is reported and it exits 0 ([test](tests/formatting.scenario.l2.test.ts))
- Given a directory path operand, when `spx validation format <directory>` runs, then the operand expands to a recursive `**/*` glob before dprint dispatch ([test](tests/formatting.scenario.l2.test.ts))
- Given a relative path operand from an invocation subdirectory, when `spx validation format <path>` runs, then the operand resolves from the effective invocation directory before product-relative dprint dispatch ([test](tests/formatting.scenario.l2.test.ts))
- Given validation path filters would narrow a formatting directory operand, when `spx validation format <directory>` runs, then dprint receives the explicit directory scope without wrapper filtering ([test](tests/formatting.scenario.l2.test.ts))
- Given `spx validation all` receives no formatting participation override, formatting runs by default; given the descriptor's invocation-local override, formatting follows the inverse and does not run ([test](tests/formatting.scenario.l2.test.ts))

### Mappings

- For each extension in `.ts`, `.tsx`, `.js`, `.json`, `.jsonc`, `.md`, `.toml`, `.yaml`, and `.yml`, an unformatted file participates in the formatting verdict and is reported ([test](tests/formatting.mapping.l1.test.ts))
- Unformatted files at `pnpm-lock.yaml` and below `testing/fixtures/**` do not participate in the formatting verdict ([test](tests/formatting.mapping.l1.test.ts))
- The registered TypeScript, Markdown, and formatting language descriptors map in registry order to contiguous pipeline stage segments, with the formatting segment following the preserved TypeScript and Markdown segments ([test](tests/formatting.mapping.l1.test.ts))

### Properties

- Formatting argument construction is deterministic: the same file scope always produces the same `dprint check` invocation ([test](tests/formatting.property.l1.test.ts))

### Compliance

- ALWAYS: dprint stdout and stderr are forwarded through the parent process output streams exactly once while remaining captured for programmatic callers ([test](tests/formatting.compliance.l1.test.ts))
- ALWAYS: dprint runs from the supplied product directory so that directory's `dprint.jsonc` decides the verdict independently of any personal global dprint config ([test](tests/formatting.compliance.l1.test.ts))
- ALWAYS: automatic formatting scope forwards configured validation path excludes additively as dprint `--excludes` values ([test](tests/formatting.compliance.l1.test.ts))
- ALWAYS: the tracked dprint dependency is exact-pinned and every formatter plugin carries a sha256 checksum, so clean installs resolve an integrity-verified formatter set ([audit])
- ALWAYS: when the product directory has no `dprint.jsonc`, `spx validation format` skips and exits 0 — a product with no formatting config has no contract to enforce, so no personal global dprint config decides the verdict ([test](tests/formatting.compliance.l1.test.ts))
