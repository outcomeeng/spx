PROVIDES a multi-language code quality pipeline that reports each tool's result as it completes
SO THAT developers and agents running `spx validation all`
CAN surface security, maintainability, and reliability issues before they reach production

## Assertions

### Scenarios

- Given a product with no violations, when `spx validation all` runs, then the pipeline completes successfully and exits 0 ([test](tests/validation.scenario.l2.test.ts))
- Given a product with a failing step, when `spx validation all` runs, then the pipeline reports the failure with step name and details ([test](tests/validation.scenario.l2.test.ts))
- Given `--scope production`, when `spx validation all` is dispatched, then the full-pipeline handler receives production scope ([test](tests/validation-cli.scenario.l2.test.ts))
- Given a source directory or file positional operand, when `spx validation all` is dispatched, then the full-pipeline handler receives that file scope ([test](tests/validation-cli.scenario.l2.test.ts))
- Given all validation steps complete, when pipeline output is read, then step results appear in execution order ([test](tests/validation.scenario.l2.test.ts))

### Properties

- Adding a conforming stage at any position in the registered pipeline preserves every registered stage's verdict ([test](tests/validation.property.l1.test.ts))
- Given identical product state, registered stages, command arguments, and stage outcomes, validation returns identical stage verdicts and exit code ([test](tests/validation.property.l1.test.ts))

### Compliance

- ALWAYS: validation runs all configured steps regardless of earlier failures — no short-circuit ([test](tests/validation.compliance.l2.test.ts))
- ALWAYS: validation exit code is non-zero when any participating stage configured to fail the pipeline returns non-zero ([test](tests/validation.compliance.l2.test.ts))
- ALWAYS: each step uses "problem" as the canonical term for an item requiring developer attention ([test](tests/validation.compliance.l2.test.ts))
- ALWAYS: each step reports its own duration ([test](tests/validation.compliance.l2.test.ts))
- ALWAYS: TypeScript-derived scope discovery reads product tool configuration and directories from the requested product root ([test](tests/scope-resolution.compliance.l1.test.ts))
- ALWAYS: the temporary `tsconfig.json` generated for scope-filtered or file-specific TypeScript validation is written under the product's `node_modules/` directory and declares no `typeRoots` or `types` — it inherits type resolution from the base config through `extends`, so the temporary file never appears in the product's tracked working tree, per `spx/41-validation.enabler/21-validation-configuration.adr.md` ([test](tests/scope-resolution.compliance.l1.test.ts))
- ALWAYS: validation stages compose through the language registry exported by `src/validation/registry.ts` ([test](tests/registry.compliance.l1.test.ts))
- ALWAYS: every registered validation stage declares its default full-pipeline participation and any invocation-local override metadata in its stage descriptor ([test](tests/registry.compliance.l1.test.ts))
- ALWAYS: validation commands resolve descriptor defaults, configured enablement, aggregate stage scope, and per-tool path filters from product configuration before executing validation tools ([test](tests/configuration.compliance.l1.test.ts))
- ALWAYS: bundled validation tool discovery recognizes packages that expose their entry point only through ESM `exports` and do not expose `package.json` to CommonJS resolution ([test](tests/tool-discovery.compliance.l1.test.ts))
- ALWAYS: validation tool discovery can prefer a product-local executable before a bundled fallback while preserving bundled-first discovery as its default ([test](tests/tool-discovery.compliance.l1.test.ts))
