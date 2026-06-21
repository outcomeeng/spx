# dprint Integration

Formatting validation invokes the pinned `dprint` binary as a managed subprocess in check mode (`dprint check`) through a dependency-injected process runner, resolving its `dprint.jsonc` from the product root by dprint's own upward configuration discovery. A pure argument builder constructs the invocation, and the subprocess-running function threads the injected runner; the stage is registered as a `ValidationLanguageDescriptor` (`formattingValidationLanguage`) composed into the pipeline through `src/validation/registry.ts`, with participation and path scope derived from the resolved `spx.config.*` validation configuration. The step lives in `src/validation/steps/formatting.ts`, the command in `src/commands/validation/formatting.ts`, and the descriptor in `src/validation/languages/formatting.ts`.

## Rationale

dprint is distributed as a compiled binary whose whole-project formatting is reachable only through its command-line interface, so the stage spawns `dprint check` through an injected process runner to obtain the binary's own multi-language formatting verdict and exit code without reimplementing its formatter plugins. dprint discovers `dprint.jsonc` by walking upward from its working directory, so running the subprocess with the product root as its working directory resolves the single repository-tracked config — which pins dprint to an exact version and every formatter plugin to a sha256 checksum — and writes nothing into validated directories. Treating dprint as an always-present dependency, resolved from the project's installed binary, satisfies the spec's reproducible-verdict requirement without a discovery or skip path.

Check mode is mandatory for the validation stage: the gate reports unformatted files and exits non-zero without rewriting them, leaving file rewriting to the separate developer-facing format command. A programmatic WASM formatter invocation was rejected because it would reimplement per-plugin formatting and configuration resolution that the binary already owns, diverging the gate's verdict from a direct `dprint check`. An optional dependency with runtime discovery was rejected because the spec mandates a reproducible verdict from a clean install with no skip path, which an exact-pinned dependency and a direct binary resolution satisfy more simply.

## Verification

### Audit

- ALWAYS: invoke dprint by spawning the pinned `dprint` binary as a managed subprocess through a dependency-injected process runner — enables `l1` verification of invocation logic without mocking ([audit])
- ALWAYS: construct the dprint invocation through a pure argument builder separate from the subprocess-running function — enables `l1` verification of argument construction ([audit])
- ALWAYS: run the dprint subprocess with the product root as its working directory so dprint resolves `dprint.jsonc` by its own upward discovery — the config stays a single product-root file ([audit])
- ALWAYS: resolve the dprint binary from the project's installed dependency, treating it as always present — no `discoverTool()` and no skip path ([audit])
- ALWAYS: run dprint in check mode so the stage reports unformatted files and exits non-zero without rewriting them ([audit])
- ALWAYS: register formatting as a `ValidationLanguageDescriptor` composed through `src/validation/registry.ts` per `spx/19-language-registration.adr.md`, so pipeline ordering derives from the registry rather than a hardcoded step index ([audit])
- ALWAYS: mark the formatting stage `failsPipeline: true` so an unformatted file fails `spx validation all` ([audit])
- ALWAYS: derive formatting participation and path scope from the resolved `spx.config.*` validation configuration per `spx/41-validation.enabler/21-validation-configuration.adr.md` ([audit])
- NEVER: read or mutate `process.env` to decide formatting participation or scope — hidden process state breaks deterministic validation ([audit])
- NEVER: run dprint in rewrite mode (`dprint fmt`) inside the validation stage — the gate checks, it does not modify the working tree ([audit])
- NEVER: write a dprint configuration file into validated directories — the single product-root config governs every run ([audit])
- NEVER: use `vi.mock()` or `jest.mock()` for the process runner or filesystem — inject controlled implementations and exercise the real helper code paths ([audit])
