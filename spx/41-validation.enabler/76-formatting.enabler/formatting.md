# Formatting

PROVIDES dprint-based code-formatting verification across the product's TypeScript, JSON, Markdown, TOML, and YAML files
SO THAT `spx validation all` and `spx validation format`
CAN catch unformatted files before they reach the repository, with one verdict reproducible across every worktree, contributor, and CI runner

## Assertions

### Scenarios

- Given a project whose files are all formatted, when `spx validation format` runs, then no problems are reported and it exits 0 ([test](tests/formatting.scenario.l2.test.ts))
- Given a project with an unformatted file, when `spx validation format` runs, then a problem is reported identifying the file and the command exits non-zero ([test](tests/formatting.scenario.l2.test.ts))
- Given `spx validation all` runs, then formatting executes as a registry-composed stage and its failure fails the pipeline ([test](tests/formatting.scenario.l2.test.ts))
- Given a user runs `spx validation format` on a project with an unformatted file, then the process exits non-zero and the output identifies the file ([test](tests/formatting.scenario.l3.test.ts))

### Mappings

- dprint formats `.ts`, `.tsx`, `.js`, `.json`, `.jsonc`, `.md`, `.toml`, `.yaml`, and `.yml` files; `pnpm-lock.yaml` and `testing/fixtures/**` are excluded; `.gitignore`d paths are skipped ([test](tests/formatting.mapping.l1.test.ts))

### Properties

- Formatting verification is deterministic: the same files always produce the same pass/fail verdict ([test](tests/formatting.property.l1.test.ts))
- Formatting is additive: adding the formatting stage never changes the verdict of existing validation stages ([test](tests/formatting.property.l1.test.ts))

### Compliance

- ALWAYS: formatting composes through the validation registry (`src/validation/registry.ts`) per `spx/19-language-registration.adr.md`, so pipeline ordering derives from the registry rather than a hardcoded step index ([test](tests/formatting.compliance.l1.test.ts))
- ALWAYS: formatting participation and scope derive from resolved `spx.config.*` validation configuration per `spx/41-validation.enabler/21-validation-configuration.adr.md`, never from ad hoc files or process environment ([audit])
- ALWAYS: the `dprint.jsonc` config resolves from the product root and pins both dprint (exact devDependency) and every formatter plugin (sha256 checksum), so the verdict is reproducible and integrity-verified from a clean install, independent of any personal global dprint config ([audit])
- NEVER: format `pnpm-lock.yaml` or `testing/fixtures/**` — pnpm owns the lockfile format and fixtures are deliberate defect inputs that formatting would corrupt ([test](tests/formatting.compliance.l1.test.ts))
