# Validation Configuration

Validation commands compose their effective automatic scope from product-root-relative tool configuration and the resolved `spx.config.*` validation configuration; explicit caller path scope is resolved before validation path filters and is never silently erased by those filters. Full-pipeline stage participation is the product of each registered stage descriptor's default participation and the invocation-local override set supplied by `spx validation all`; standalone stage subcommands run their handlers directly. No validation command reads process environment variables to decide stage participation or scope. The validation descriptor owns global path filters under `validation.paths.{include,exclude}`, per-tool path subsections such as `validation.paths.eslint.{include,exclude}` and `validation.paths.knip.{include,exclude}`, and literal-specific configuration under `validation.literal.*`. Scope-filtered or file-specific TypeScript validation writes a temporary `tsconfig.json` under the product's `node_modules/` directory that inherits compiler options from the base config through `extends` and declares no `typeRoots` or `types`, so the wrapper resolves type roots, type references, and path aliases exactly as a direct `tsc` run does and the temporary file never enters the tracked working tree.

## Rationale

Tool-native configuration remains the strictest product-owned surface because running the underlying tool directly should reveal every issue that tool is configured to detect; SPX configuration narrows automatic wrapper scope without weakening the tool configuration itself. The config descriptor pattern (per `spx/16-config.enabler/21-descriptor-registration.adr.md`) gives validation a typed, reviewable source for wrapper behavior, where global `validation.paths.{include,exclude}` applies to every tool while per-tool subsections narrow one stage without changing any other. Stage descriptors own full-pipeline participation defaults because the registry already owns the stage set and ordering; adding or changing a default therefore changes the descriptor, while CLI help and full-pipeline execution derive from the same metadata. Explicit caller paths are invocation scope: they bypass validation path filters while remaining subject to the tool's own maximum surface, such as TypeScript source scope when a TypeScript-only stage runs. Process environment variables are hidden mutable state — they make two invocations with the same product root, config files, and arguments produce different behavior — so they do not belong in validation command decisions.

Environment-driven stage toggles are invalid because they are invisible in review and CI configuration. Tool-native ignore files are invalid for wrapper narrowing because they weaken direct tool runs and leak SPX policy into product tool configuration. Only-global validation path filters are insufficient because lint, type checking, circular dependency detection, Knip, markdown validation, and literal reuse have distinct operational costs and path semantics that each stage must be able to narrow independently.

## Invariants

- Given the same product root, product tool configuration, `spx.config.*`, command arguments, and validation scope, validation commands produce the same stage participation and effective path scope.
- For every registered validation stage, full-pipeline participation equals the stage descriptor's default participation unless `spx validation all` receives that stage's invocation-local override.
- Every path passed to a validation tool by an SPX command is within that tool's product-configured maximum surface and the wrapper's declared effective scope.

## Verification

### Testing

- ALWAYS: explicit caller paths bypass SPX validation path filters while remaining within the invoked tool's maximum surface; automatic validation scope applies the configured filters ([compliance])

### Audit

- ALWAYS: resolve validation wrapper behavior through `resolveConfig(productDir)` and the validation descriptor — keeps command behavior declared in `spx.config.*` ([audit])
- ALWAYS: resolve product tool configuration relative to the same product root used for command execution — keeps scope discovery and tool execution aligned ([audit])
- ALWAYS: treat product tool configuration as the maximum tool surface — keeps direct tool runs at least as strict as wrapper runs ([audit])
- ALWAYS: prefer a production ESLint flat config when one exists for production scope — keeps type-aware parser and resolver configuration aligned with `tsconfig.production.json` ([audit])
- ALWAYS: pass production-scope ESLint excludes through the documented ESLint CLI ignore-pattern flag — keeps dynamic wrapper narrowing out of flat-config product policy ([audit])
- ALWAYS: validate global `validation.paths.{include,exclude}` and per-tool `validation.paths.<tool>.{include,exclude}` through the validation descriptor — supports wrapper-wide and stage-specific narrowing ([audit])
- ALWAYS: declare every stage's default full-pipeline participation and optional invocation-local override in the stage descriptor, then derive `spx validation all` option registration and run/skip decisions from that metadata ([audit])
- ALWAYS: accept the ordered validation stage collection through a typed full-pipeline command input, with the static validation registry wired as the production default — enables isolated orchestration verification without replacing modules ([audit])
- ALWAYS: write the temporary `tsconfig.json` generated for scope-filtered or file-specific TypeScript validation under the product's `node_modules/` directory and inherit compiler options from the base configuration through `extends` — so TypeScript resolves type roots, type references, and path aliases against the product's own `node_modules` exactly as a direct `tsc` run does, and the temporary file never appears in the tracked working tree ([audit])
- NEVER: read `process.env` to enable, disable, include, exclude, or otherwise scope validation subcommands — hidden mutable process state breaks deterministic validation ([audit])
- NEVER: mutate `process.env` to influence a validation tool — command handlers and validation steps keep process state stable for sibling stages ([audit])
- NEVER: compute validation scope from `process.cwd()` when the command has a requested product root — shell state must not override the command target ([audit])
- NEVER: add stage-specific skip booleans to the full-pipeline command context — invocation-local overrides are a descriptor-keyed set, and the orchestrator resolves participation generically ([audit])
- NEVER: store SPX wrapper narrowing in tool-native ignore/config files — direct tool runs must remain governed by product tool configuration alone ([audit])
- NEVER: add TypeScript compiler options to a temporary `tsconfig.json` that the product's own configuration does not resolve to — a fabricated `typeRoots` or `types` entry makes the wrapper run diverge from a direct `tsc` run ([audit])
- NEVER: use `vi.mock()` or `jest.mock()` to replace full-pipeline validation stages — inject controlled stage implementations through the typed command input ([audit])
