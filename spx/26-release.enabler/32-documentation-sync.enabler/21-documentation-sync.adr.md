# Documentation Sync Architecture

Documentation sync resolves its document set from the registered `release.documentation.paths` configuration, defaults that set to the product README, stages existing documents in an isolated real-filesystem workspace, invokes the injected agent runner against the staged paths, reads every staged document back, validates version references, audits the complete changed set against release data through a separate agent-auditor query, and promotes the set only after every document passes. The `spx release docs sync` Commander path composes the registered release descriptor, shared release-data computation, production agent boundary, filesystem adapter, and pure documentation-sync domain composition.

## Rationale

The document set is release policy, so its descriptor lives with the release domain and enters the static config registry without teaching the config module release vocabulary. Isolated staging gives the agent real files and keeps product documentation unchanged while generation, structural validation, or faithfulness audit can still fail. Reading and validating the complete set before promotion prevents an accepted release from carrying a mixture of audited and unaudited documentation. A separate no-tools audit query judges the read-back content rather than accepting the producing query's result as evidence.

## Invariants

- Every configured document path resolves canonically to a regular non-symlink file inside the product working tree.
- The producing query writes only inside the isolated staging workspace; product documentation changes only through the promotion boundary after complete-set validation.
- The audit input is exactly the shared release data and the read-back staged document set.

## Verification

### Testing

- ALWAYS: omitted `release.documentation.paths` resolves to the product README and a configured non-empty path set resolves in declared order without duplicates ([mapping])
- ALWAYS: every staged document contains the released version before the faithfulness audit and promotion run ([compliance])
- ALWAYS: path traversal, canonical escape, final symlink, missing file, directory target, failed generation, failed read-back, failed version validation, and rejected faithfulness audit leave product documentation unpromoted ([compliance])
- NEVER: promote any document until the complete configured set has passed read-back, version validation, and faithfulness audit ([compliance])

### Audit

- ALWAYS: the release domain exports a typed `ConfigDescriptor` for the `release` section and the config registry imports it statically ([audit])
- ALWAYS: pure documentation-set resolution, prompt assembly, version validation, and orchestration live under `src/domains/release/`; filesystem effects live behind injected command-layer boundaries; Commander composition lives in `src/interfaces/cli/release.ts` ([audit])
- ALWAYS: the producer and faithfulness auditor use distinct injected interfaces and distinct Claude Agent SDK queries; the producing query returns no verdict and the audit query receives no tools ([audit])
- NEVER: direct filesystem access, config-file parsing, process access, or model access occurs inside the documentation-sync domain composition ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, filesystem mocking, or framework-level module replacement substitutes for agent, configuration, filesystem, audit, staging, or promotion dependencies ([audit])
