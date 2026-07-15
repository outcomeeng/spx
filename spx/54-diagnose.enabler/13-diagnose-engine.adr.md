# Diagnose Engine

`spx diagnose` is a deterministic environment-diagnostics pipeline — gather each selected provider's readings, classify each reading set against a fixed provider-owned verdict table, fold the per-check verdicts into one overall verdict, and project that report as concise human text, detailed human text, or complete JSON — composed as the `diagnose` command domain per `spx/14-cli-composition.adr.md`. Effective diagnose facts combine a supplied manifest's caller-overridable facts with product-owned `harnessEnvironment` configuration resolved from the addressed checkout; a manifest never carries or overrides agent marketplace, plugin, or skill intent.

The manifest contract carries the facts a caller can pin independently of product-owned harness configuration:

```json
{
  "spx_floor": "<semver>",
  "methodology": { "source": "<owner/repo>", "version": "installed | <version>" },
  "checks": ["<check-name>", "..."]
}
```

The `checks` array names the provider set in execution order. `spx_floor` is required when `spx-reachability` is selected, and `methodology` is required when `methodology-context` is selected. Plugin-bootstrap and marketplace-install consume the resolved `harnessEnvironment` descriptor in every invocation mode. The plugin-bootstrap provider classifies whether every enabled agent declares the Outcome Engineering marketplace and `spec-tree` plugin, and reports per-agent plugin sets plus their symmetric differences as informational readings. The marketplace-install provider evaluates each enabled agent's own configured marketplace subset against that agent's present plugin CLI; marketplace offerings absent from the product configuration do not participate.

The Commander descriptor selects concise text by default, detailed text with `--verbose`, and JSON with `--json`; the explicit output selectors are mutually exclusive. The overall verdict folds per-check buckets by broken > unknown > degraded > healthy, excluding not-applicable, and the process exit code maps healthy to 0, degraded to 1, unknown to 2, and broken to 3. Every external reading is obtained through a dependency-injected command, environment, git, or filesystem boundary; no language model participates.

## Rationale

Product plugin requirements vary by checkout and by enabled agent. Resolving them through the harness-environment descriptor preserves one product-owned source and prevents a marketplace catalog or plugin-shipped manifest from becoming an installation requirement. A separate declaration-health provider keeps malformed product intent distinct from live installation drift, while informational cross-agent differences preserve intentional agent-specific subsets.

Fixed verdict tables and precedence make classification deterministic. Dependency-injected probes keep runtime commands outside pure provider classification and allow each provider to verify controlled readings without replacing modules or mutating ambient agent state.

## Invariants

- Identical effective facts and probe readings produce identical per-check records and the same overall verdict.
- Product-owned harness-environment facts originate from the addressed checkout in every invocation mode.
- Every enabled agent's marketplace-install expectation is exactly that agent's configured plugin subset for the configured marketplace.
- Cross-agent plugin-set differences change informational readings only.
- The exit code is a total function of the overall verdict and is independent of presentation mode.
- JSON projection is complete for every report and independent of human verbosity.

## Verification

### Audit

- ALWAYS: the `diagnose` command domain follows `spx/14-cli-composition.adr.md` — pure provider classification and report projection in `src/domains/`, reading-gathering orchestration in `src/commands/`, and Commander wiring plus process I/O in `src/interfaces/cli/` ([audit])
- ALWAYS: effective diagnose facts distinguish caller-overridable manifest facts from product-owned `harnessEnvironment` facts resolved through the static config registry ([audit])
- ALWAYS: plugin-bootstrap declaration health is owned by `spx/33-harness-environment.enabler/43-plugin-bootstrap.enabler`, and `spx diagnose` includes that provider's record per `spx/54-diagnose.enabler/31-composable-diagnostics.pdr.md` ([audit])
- ALWAYS: marketplace-install receives per-agent marketplace and plugin expectations derived from resolved harness configuration and probes live agent surfaces through injected dependencies ([audit])
- ALWAYS: report projection receives typed output-mode input from the Commander descriptor and performs no process, argument, or environment reads ([audit])
- ALWAYS: each provider is a pure verdict function from gathered readings to a record carrying verdict, bucket, readings, and remediation ([audit])
- NEVER: a manifest carries or overrides agent marketplace, plugin, or skill intent ([audit])
- NEVER: marketplace catalog contents determine a product's expected plugin set ([audit])
- NEVER: cross-agent plugin-set differences alone produce a non-healthy verdict ([audit])
- NEVER: any pipeline stage consults a language model ([audit])
- NEVER: a module under `src/domains/` performs process, git, or filesystem access directly, or imports from `src/commands/` or `src/interfaces/cli/` ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or `memfs` substitutes for process, git, or filesystem boundaries ([audit])
