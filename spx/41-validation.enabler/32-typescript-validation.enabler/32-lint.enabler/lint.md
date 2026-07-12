PROVIDES ESLint-based lint checking for TypeScript source code
SO THAT `spx validation lint` and `spx validation all`
CAN run ESLint against TypeScript products — executing style, correctness, and custom AST enforcement rules — without touching products where TypeScript is absent

## Assertions

### Scenarios

- Given a product with TypeScript present and an ESLint flat config, when `spx validation lint` runs, then the command reports a successful ESLint verdict ([test](tests/lint.scenario.l2.test.ts))
- Given a product where language detection reports TypeScript absent, when `spx validation lint` runs, then the command reports an explicit skip and no `npx` install prompt appears ([test](tests/lint.scenario.l2.test.ts))
- Given a product with TypeScript present but no ESLint flat config file, when `spx validation lint` runs, then the command reports a missing config error ([test](tests/lint.scenario.l2.test.ts))

### Compliance

- ALWAYS: the executable returned by ESLint discovery is the binary the lint subprocess spawns ([test](tests/lint-args.compliance.l1.test.ts))
- ALWAYS: tool discovery and ESLint subprocess invocation occur only after TypeScript and an ESLint flat config are present ([test](tests/lint.compliance.l2.test.ts))
- NEVER: invoke ESLint via `npx` against a product lacking an ESLint flat config — prevents installation prompts and ENOENT failures ([test](tests/lint.compliance.l2.test.ts))
- ALWAYS: ESLint uses the flat config file reported by language detection — path correctness is covered by unit tests on `detectTypeScript` ([audit])
- ALWAYS: ESLint receives only the target product's flat config, fix mode, and caller-supplied file scope — `spx` does not inject repository-specific ignore patterns or warning-budget policy into consuming products ([test](tests/lint-args.compliance.l1.test.ts))
- ALWAYS: consecutive lint invocations execute the discovered ESLint binary and return each invocation's fresh result ([test](tests/lint-args.compliance.l1.test.ts))
- ALWAYS: repository lint-debt manifest checks run inside `spx validation lint`, are skipped for projects without those manifests, compare additions against the branch base when available, and never run while loading `eslint.config.ts` ([test](tests/lint-policy.compliance.l1.test.ts))
