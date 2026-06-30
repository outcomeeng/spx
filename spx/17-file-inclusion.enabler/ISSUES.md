# Issues: File Inclusion

## Domain path-filter handoff across config and consumers

File-inclusion domain filters are split across three ownership points:

- `src/config/primitives/path-filter.ts` owns the reusable typed path-filter shape.
- Owning domains resolve their descriptor-backed path filters, such as `validation.paths`.
- File-inclusion receives the already-typed filter through `ScopeRequest.domainPathFilter`; `resolveScope` does not read `spx.config.*` directly.

This split is correct, but it makes consumer wiring easy to miss. A consumer can resolve its domain config and still bypass file-inclusion, or call file-inclusion without passing the domain-owned path filter.

Governing artifacts:

- `spx/17-file-inclusion.enabler/file-inclusion.md`
- `spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md`
- `spx/17-file-inclusion.enabler/15-scope-composition.adr.md`
- `spx/17-file-inclusion.enabler/65-domain-path-filters.enabler/domain-path-filters.md`
- `spx/16-config.enabler/32-shared-config-primitives.enabler/shared-config-primitives.md`

Checklist for each `spx validation` or `spx test` consumer that walks files or passes file-scope arguments:

- Identify whether the consumer participates in validate or test work.
- For review, audit, and evaluate changeset verification, confirm scope derives from `spx verify --scope-type changeset` base/head paths rather than automatic file-inclusion walks.
- Identify the owning descriptor section for its domain path filter, if any.
- Confirm the descriptor consumes `PathFilterConfig` from `src/config/primitives/path-filter.ts` rather than defining a duplicate include/exclude shape.
- Confirm the command resolves its domain config through the config module before scope resolution.
- Confirm automatic validate/test scope flows through `resolveScope`.
- Confirm the domain-owned path filter is passed as `ScopeRequest.domainPathFilter`.
- Confirm explicit caller-supplied paths bypass domain filters and remain included.
- Confirm the consumer does not restate Git-ignored defaults such as `node_modules`, `dist`, dot-prefixed paths, build artifacts, or hidden-path rules in its own scope logic.
- Confirm user-facing `--no-ignore`, `--no-ignore-vcs`, and `--ignore-file <path>` support exists where the owning CLI spec requires ignore override flags.
- Confirm downstream tool arguments are produced from `ScopeResult` or a file-inclusion adapter rather than a duplicate ignore-list builder.
