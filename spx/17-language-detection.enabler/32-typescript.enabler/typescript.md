# TypeScript Detection

PROVIDES identification of projects that use TypeScript
SO THAT TypeScript-specific tools (validation stages and test runners)
CAN determine whether to run against the current project root

## Assertions

### Scenarios

- Given a project root containing `tsconfig.json`, when TypeScript detection runs, then it reports TypeScript present ([test](tests/typescript.property.l1.test.ts))
- Given a project root with no `tsconfig.json`, when TypeScript detection runs, then it reports TypeScript absent ([test](tests/typescript.property.l1.test.ts))
- Given a project root containing `tsconfig.json` and an ESLint flat config, when TypeScript detection runs, then it reports TypeScript present and the ESLint config path ([test](tests/typescript.property.l1.test.ts))

### Mappings

- ESLint flat config priority: `eslint.config.ts` > `eslint.config.js` > `eslint.config.mjs` > `eslint.config.cjs` ([test](tests/typescript.property.l1.test.ts))

### Compliance

- ALWAYS: the marker file for TypeScript is `tsconfig.json` in the project root ([test](tests/typescript.property.l1.test.ts))
- NEVER: return true for TypeScript presence based on `.ts` file extensions — detection uses marker files only ([review])
