# TypeScript Lint

PROVIDES ESLint-based lint checking for TypeScript source code
SO THAT `spx validation lint` and `spx validation all`
CAN run ESLint against TypeScript projects — executing style, correctness, and custom AST enforcement rules — without touching projects where TypeScript is absent

## Assertions

### Scenarios

- Given a project with TypeScript present and an ESLint flat config, when `spx validation lint` runs, then ESLint executes against the project ([test](tests/lint.integration.test.ts))
- Given a project where language detection reports TypeScript absent, when `spx validation lint` runs, then ESLint does not execute and no `npx` install prompt appears ([test](tests/lint.integration.test.ts))
- Given a project with TypeScript present but no ESLint flat config file, when `spx validation lint` runs, then the command reports a missing config error ([test](tests/lint.integration.test.ts))

### Compliance

- ALWAYS: ESLint invocation is gated on `detectTypeScript` reporting present ([test](tests/lint.integration.test.ts))
- NEVER: invoke ESLint via `npx` against a project lacking an ESLint flat config — prevents installation prompts and ENOENT failures ([test](tests/lint.integration.test.ts))
- ALWAYS: ESLint uses the flat config file reported by language detection — path correctness is covered by unit tests on `detectTypeScript` ([review])
- ALWAYS: ESLint receives only the target project's flat config, cache settings, fix mode, and caller-supplied file scope — `spx` does not inject repository-specific ignore patterns or warning-budget policy into consuming projects ([test](tests/lint-args.compliance.l1.test.ts))
- ALWAYS: repository lint-debt manifest checks run inside `spx validation lint`, are skipped for projects without those manifests, compare additions against the branch base when available, and never run while loading `eslint.config.ts` ([test](tests/lint-policy.compliance.l1.test.ts))
