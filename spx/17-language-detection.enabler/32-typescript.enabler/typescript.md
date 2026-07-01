# TypeScript Detection

PROVIDES identification of products that use TypeScript
SO THAT TypeScript-specific tools (validation stages and test runners)
CAN determine whether to run against the current product root

## Assertions

### Scenarios

- Given a product root containing `tsconfig.json`, when TypeScript detection runs, then it reports TypeScript present ([test](tests/typescript.scenario.l1.test.ts))
- Given a product root with no `tsconfig.json`, when TypeScript detection runs, then it reports TypeScript absent ([test](tests/typescript.scenario.l1.test.ts))
- Given a product root containing `tsconfig.json` and an ESLint flat config, when TypeScript detection runs, then it reports TypeScript present and the ESLint config path ([test](tests/typescript.scenario.l1.test.ts))

### Mappings

- ESLint flat config priority follows the source-owned `ESLINT_CONFIG_FILES` and `ESLINT_PRODUCTION_CONFIG_FILES` registry order ([test](tests/typescript.mapping.l1.test.ts))

### Compliance

- ALWAYS: the marker file for TypeScript is `tsconfig.json` in the product root ([test](tests/typescript.compliance.l1.test.ts))
- NEVER: return true for TypeScript presence based on `.ts` file extensions — detection uses marker files only ([test](tests/typescript.compliance.l1.test.ts))
