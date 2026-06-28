# Validation Configuration

Validation commands compose their effective automatic scope from project-root-relative tool configuration and the resolved `spx.config.*` validation configuration; explicit caller path scope is resolved before validation path filters and is never silently erased by those filters. No validation command reads process environment variables to decide stage participation or scope. The validation descriptor owns global path filters under `validation.paths.{include,exclude}`, per-tool path subsections such as `validation.paths.eslint.{include,exclude}` and `validation.paths.knip.{include,exclude}`, and literal-specific configuration under `validation.literal.*`. Scope-filtered or file-specific TypeScript validation writes a temporary `tsconfig.json` under the project's `node_modules/` directory that inherits compiler options from the base config through `extends` and declares no `typeRoots` or `types`, so the wrapper resolves type roots, type references, and path aliases exactly as a direct `tsc` run does and the temporary file never enters the tracked working tree.

## Rationale

Tool-native configuration remains the strictest project-owned surface because running the underlying tool directly should reveal every issue that tool is configured to detect; SPX configuration narrows automatic wrapper scope without weakening the tool configuration itself. The config descriptor pattern (per `spx/16-config.enabler/21-descriptor-registration.adr.md`) gives validation a typed, reviewable source for wrapper behavior, where global `validation.paths.{include,exclude}` applies to every tool while per-tool subsections narrow one stage without changing any other. Explicit caller paths are invocation scope: they bypass validation path filters while remaining subject to the tool's own maximum surface, such as TypeScript source scope when a TypeScript-only stage runs. Process environment variables are hidden mutable state — they make two invocations with the same project root, config files, and arguments produce different behavior — so they do not belong in validation command decisions.

Environment-driven stage toggles were rejected because they are invisible in review and CI configuration; tool-native ignore files for wrapper narrowing were rejected because they weaken direct tool runs and leak SPX policy into project tool configuration; only-global validation path filters were rejected because lint, type checking, circular dependency detection, Knip, markdown validation, and literal reuse have distinct operational costs and path semantics that each stage must be able to narrow independently.

## Invariants

- Given the same project root, project tool configuration, `spx.config.*`, command arguments, and validation scope, validation commands produce the same stage participation and effective path scope.
- Every path passed to a validation tool by an SPX command is within that tool's project-configured maximum surface and the wrapper's declared effective scope.

## Verification

### Audit

- ALWAYS: resolve validation wrapper behavior through `resolveConfig(projectRoot)` and the validation descriptor — keeps command behavior declared in `spx.config.*` ([audit])
- ALWAYS: resolve project tool configuration relative to the same project root used for command execution — keeps scope discovery and tool execution aligned ([audit])
- ALWAYS: treat project tool configuration as the maximum tool surface — keeps direct tool runs at least as strict as wrapper runs ([audit])
- ALWAYS: prefer a production ESLint flat config when one exists for production scope — keeps type-aware parser and resolver configuration aligned with `tsconfig.production.json` ([audit])
- ALWAYS: pass production-scope ESLint excludes through the documented ESLint CLI ignore-pattern flag — keeps dynamic wrapper narrowing out of flat-config project policy ([audit])
- ALWAYS: validate global `validation.paths.{include,exclude}` and per-tool `validation.paths.<tool>.{include,exclude}` through the validation descriptor — supports wrapper-wide and stage-specific narrowing ([audit])
- ALWAYS: resolve explicit caller paths before applying SPX validation path filters, so a validation path filter never silently erases a product path the caller named; tool-owned maximum surfaces still govern whether that stage can process the target ([audit])
- ALWAYS: write the temporary `tsconfig.json` generated for scope-filtered or file-specific TypeScript validation under the project's `node_modules/` directory and inherit compiler options from the base configuration through `extends` — so TypeScript resolves type roots, type references, and path aliases against the project's own `node_modules` exactly as a direct `tsc` run does, and the temporary file never appears in the tracked working tree ([audit])
- NEVER: read `process.env` to enable, disable, include, exclude, or otherwise scope validation subcommands — hidden mutable process state breaks deterministic validation ([audit])
- NEVER: mutate `process.env` to influence a validation tool — command handlers and validation steps keep process state stable for sibling stages ([audit])
- NEVER: compute validation scope from `process.cwd()` when the command has a requested project root — shell state must not override the command target ([audit])
- NEVER: store SPX wrapper narrowing in tool-native ignore/config files — direct tool runs must remain governed by project tool configuration alone ([audit])
- NEVER: add TypeScript compiler options to a temporary `tsconfig.json` that the project's own configuration does not resolve to — a fabricated `typeRoots` or `types` entry makes the wrapper run diverge from a direct `tsc` run ([audit])
