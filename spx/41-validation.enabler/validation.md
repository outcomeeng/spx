# Validation

PROVIDES a multi-language code quality pipeline that reports each tool's result as it completes
SO THAT developers and agents running `spx validation all`
CAN surface security, maintainability, and reliability issues before they reach production

## Assertions

### Scenarios

- Given a project with no violations, when `spx validation all` runs, then all steps pass and exit 0 ([test](tests/validation.scenario.l2.test.ts))
- Given a project with a failing step, when `spx validation all` runs, then the pipeline reports the failure with step name and details ([test](tests/validation.scenario.l2.test.ts))
- Given `--scope production`, when `spx validation all` runs, then only production-scoped checks execute ([test](tests/validation.scenario.l2.test.ts))
- Given `path/to/file.ts` is supplied as a positional operand, when `spx validation all` runs, then checks target only the specified files ([test](tests/validation.scenario.l2.test.ts))
- Given a step completes, when subsequent steps are still running, then the completed step's result is already visible in output ([test](tests/validation.scenario.l2.test.ts))

### Properties

- Validation results are deterministic: the same codebase always produces the same pass/fail verdict ([test](tests/validation.property.l2.test.ts))
- Validation is additive: adding a new step never changes the verdict of existing steps ([test](tests/validation.property.l2.test.ts))

### Compliance

- ALWAYS: validation runs all configured steps regardless of earlier failures — no short-circuit ([test](tests/validation.compliance.l2.test.ts))
- ALWAYS: validation exit code is non-zero when any step fails ([test](tests/validation.compliance.l2.test.ts))
- ALWAYS: each step uses "problem" as the canonical term for an item requiring developer attention — consistent with ESLint, ruff, and VS Code tooling conventions ([audit])
- ALWAYS: each step reports its own duration ([test](tests/validation.compliance.l2.test.ts))
- ALWAYS: TypeScript-derived scope discovery reads project tool configuration and directories from the requested project root ([test](tests/scope-resolution.compliance.l1.test.ts))
- ALWAYS: the temporary `tsconfig.json` generated for scope-filtered or file-specific TypeScript validation is written under the project's `node_modules/` directory and declares no `typeRoots` or `types` — it inherits type resolution from the base config through `extends`, so the temporary file never appears in the project's tracked working tree, per `spx/41-validation.enabler/21-validation-configuration.adr.md` ([test](tests/scope-resolution.compliance.l1.test.ts))
- ALWAYS: validation command participation is derived from resolved `spx.config.*` validation configuration ([test](tests/configuration.compliance.l1.test.ts))
- ALWAYS: validation stages compose through the language registry exported by `src/validation/registry.ts`, which imports each language descriptor with an explicit import statement per `spx/19-language-registration.adr.md` ([audit])
- ALWAYS: bundled validation tool discovery recognizes packages that expose their entry point only through ESM `exports` and do not expose `package.json` to CommonJS resolution ([test](tests/tool-discovery.compliance.l1.test.ts))
