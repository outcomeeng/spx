# Validation Configuration

## Purpose

This decision governs how validation commands derive their effective tool scope, project root, path filters, and stage participation.

## Context

**Business impact:** Developers and agents rely on `spx validation all` as a deterministic quality gate. A validation run against a declared project root must use the same project configuration, tool configuration, and path scope regardless of the shell process that invokes it.

**Technical constraints:** Project tool configuration files such as `eslint.config.ts`, `eslint.config.production.ts`, `tsconfig.json`, `tsconfig.production.json`, and markdownlint configuration define the maximum surface for their tools and are resolved relative to the target project root. The central config module resolves `spx.config.*` through typed descriptors per [spx/16-config.enabler/21-descriptor-registration.adr.md](../16-config.enabler/21-descriptor-registration.adr.md). Validation subprocess lifecycle policy is governed by [spx/13-cli.enabler/15-cli-architecture.adr.md](../13-cli.enabler/15-cli-architecture.adr.md); this decision governs wrapper scope, project-root alignment, path filters, and stage participation. Validation owns a descriptor section for global path filters under `validation.paths.{include,exclude}` and literal-specific configuration under `validation.literal.*`.

## Decision

Validation commands compose their effective scope from project-root-relative tool configuration, resolved `spx.config.*` validation configuration, and explicit caller path scope; no validation command reads process environment variables to decide stage participation or scope.

## Rationale

Tool-native configuration remains the strictest project-owned surface because running the underlying tool directly should reveal every issue that tool is configured to detect. SPX configuration narrows how the SPX wrapper invokes tools without weakening the tool configuration itself.

The config descriptor pattern gives validation a typed, reviewable source for wrapper behavior. Global `validation.paths.{include,exclude}` applies to all validation tools, while per-tool path subsections such as `validation.paths.eslint.{include,exclude}` and `validation.paths.knip.{include,exclude}` declare how one validation stage narrows its wrapper scope without changing any other stage. Explicit caller paths are an invocation scope and therefore intersect with the declared config and tool scope.

Process environment variables are hidden mutable state. They make two invocations with the same project root, config files, and command arguments produce different validation behavior, so they do not belong in validation command decisions.

Alternatives considered:

- **Environment-driven stage toggles** — convenient for ad hoc shell use, but invisible in review and CI configuration; rejected because config-file state must explain wrapper behavior.
- **Tool-native ignore files for SPX wrapper narrowing** — keeps tool configuration familiar, but weakens direct tool runs and makes SPX-specific policy leak into project tool configuration; rejected because project tool configs define the maximum surface.
- **Only global validation path filters** — keeps the descriptor smaller, but forces every validation stage to share the same narrowing policy; rejected because lint, type checking, circular dependency detection, Knip, markdown validation, and literal reuse have distinct operational costs and path semantics.

## Trade-offs accepted

| Trade-off                                                 | Mitigation / reasoning                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Validation config has both global and per-tool paths      | The nesting mirrors the distinction between wrapper-wide policy and stage-specific policy                                       |
| Shell users lose hidden environment toggles               | Declared config files, explicit command flags, and committed project state make validation behavior reviewable                  |
| SPX config and tool config both influence execution       | Tool config owns maximum surface; SPX config owns wrapper narrowing and stage participation                                     |
| Production ESLint may need a separate flat config wrapper | The production wrapper imports the shared config builder and swaps only the TypeScript project file; rule policy remains shared |

## Invariants

- Given the same project root, project tool configuration, `spx.config.*`, command arguments, and validation scope, validation commands produce the same stage participation and effective path scope.
- Every path passed to a validation tool by an SPX command is within that tool's project-configured maximum surface and the SPX wrapper's declared effective scope.

## Compliance

### Recognized by

Validation command handlers accept or derive a project root, resolve validation configuration through the config descriptor registry, and pass typed config plus project-root-relative paths to validation steps.

### MUST

- Resolve validation wrapper behavior through `resolveConfig(projectRoot)` and the validation descriptor — keeps command behavior declared in `spx.config.*` ([review])
- Resolve project tool configuration relative to the same project root used for command execution — keeps scope discovery and tool execution aligned ([review])
- Treat project tool configuration as the maximum tool surface — keeps direct tool runs at least as strict as SPX wrapper runs ([review])
- Prefer a production ESLint flat config when one exists for production scope — keeps type-aware parser and resolver configuration aligned with `tsconfig.production.json` ([review])
- Pass production-scope ESLint excludes through the documented ESLint CLI ignore-pattern flag — keeps dynamic wrapper narrowing out of flat-config project policy ([review])
- Validate global `validation.paths.{include,exclude}` and per-tool `validation.paths.<tool>.{include,exclude}` through the validation descriptor — supports wrapper-wide and stage-specific narrowing ([review])
- Intersect explicit caller paths with project tool configuration and SPX validation path configuration — keeps invocation scope narrower than declared configuration ([review])
- Write the temporary `tsconfig.json` generated for scope-filtered or file-specific TypeScript validation under the project's `node_modules/` directory (gitignored in every JavaScript/TypeScript project), and inherit compiler options from the base configuration through `extends` — so TypeScript resolves type roots, type references, and path aliases against the project's own `node_modules` exactly as a direct `tsc` run does, and the temporary file never appears in the project's tracked working tree ([review])

### NEVER

- Read `process.env` to enable, disable, include, exclude, or otherwise scope validation subcommands — hidden mutable process state breaks deterministic validation ([review])
- Mutate `process.env` to influence a validation tool — command handlers and validation steps keep process state stable for sibling stages ([review])
- Compute validation scope from `process.cwd()` when the command has a requested project root — shell state must not override the command target ([review])
- Store SPX wrapper narrowing in tool-native ignore/config files — direct tool runs must remain governed by project tool configuration alone ([review])
- Add TypeScript compiler options to a temporary `tsconfig.json` that the project's own configuration does not resolve to — a fabricated `typeRoots` or `types` entry makes the SPX wrapper run diverge from a direct `tsc` run ([review])
