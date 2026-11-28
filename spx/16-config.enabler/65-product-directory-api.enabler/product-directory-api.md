---
id: 01a0ebc4-fb67-7421-90c8-76305651b0eb
malleability: verification
---

# Product Directory API

PROVIDES product-root, effective-invocation-directory, and Git common-dir product-root vocabulary for config APIs, CLI invocation, and tests
SO THAT config consumers, harnesses, and execution descriptors
CAN refer to tracked product files through `productDir` and gitignored state through the Git common-dir product root

## Assertions

### Test.Mapping: [product-context](tests/product-context.mapping.l1.test.ts)

Each command invoked with `-C <path>` maps to the result the same command gives when invoked from `<path>`, and absent `-C` the config CLI's product context maps from the invoking process directory.

| Case                  | Invocation                                         | Result                                                                           |
| --------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------- |
| config-show           | `spx -C <path> config show --json`                 | the resolved Config of `spx config show --json` invoked from `<path>`            |
| validation-typescript | `spx -C <path> validation typescript --scope full` | the validation result of the same command invoked from `<path>`                  |
| session-list          | `spx -C <path> session list --json`                | the session-store result of `spx session list --json` invoked from `<path>`      |
| no-option-process-dir | `spx config show` with no `-C`                     | the context of the invoking process directory, with the non-git fallback warning |

### Test.Compliance: vocabulary

- [product-dir-name](tests/product-directory-api.compliance.l1.test.ts): ALWAYS: config APIs, test harnesses, and descriptor tests name the tracked product root `productDir`
- [no-project-root-names](tests/product-directory-api.compliance.l1.test.ts): ALWAYS: root-directory APIs expose `productDir` rather than `projectRoot` or `projectDir`
- [no-compatibility-aliases](tests/product-directory-api.compliance.l1.test.ts): NEVER: add compatibility aliases for non-product root-directory names

### Test.Compliance: target context

- [dirty-caller-ignored](tests/product-context.compliance.l1.test.ts): ALWAYS: a config command invoked from a dirty unrelated worktree with `-C <target>` resolves config from `<target>` rather than the caller's worktree
- [nested-product-target](tests/product-context.compliance.l1.test.ts): ALWAYS: under `-C <path>` naming a directory inside a nested product, `config show`, `validation markdown`, `spec status`, and `spec context show` resolve that product's configuration and `spx/` tree, never the enclosing repository's, and an operand outside that product fails as unresolved
