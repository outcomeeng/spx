# Documentation Sync Architecture

Documentation sync resolves its document set from the registered `release.documentation.paths` configuration, defaults that set to the product README, stages existing documents in an isolated real-filesystem workspace, invokes the injected agent runner against the staged paths, reads every staged document back, validates product release-version references, audits the complete changed set by comparing each original document with its staged read-back content against release data through a separate agent-auditor query, and promotes the set only after every document passes. Promotion carries each audited original alongside its staged update, verifies that every current product document still equals its audited original, and writes no document when any target has drifted. A structural product release-version reference is an exact release version, optionally prefixed by the registered release-tag prefix, bounded by whitespace or document edges. The previous product release version is derived from `ReleaseData.previousTag`; when no previous tag exists, structural validation has no prior release version to reject. The `spx release docs sync` Commander path composes the registered release descriptor, shared release-data computation, production agent boundary, filesystem adapter, and pure documentation-sync domain composition.

## Rationale

The document set is release policy, so its descriptor lives with the release domain and enters the static config registry without teaching the config module release vocabulary. Isolated staging gives the agent real files and keeps product documentation unchanged while generation, structural validation, or faithfulness audit can still fail. Reading and validating the complete set before promotion prevents an accepted release from carrying a mixture of audited and unaudited documentation. Comparing every current target with its audited original before the first write applies optimistic concurrency at the promotion boundary, preserving intervening edits and preventing a partial staged set when any target changes during generation or audit. Deriving prior release identity from the shared release data avoids classifying unrelated semantic versions, such as runtime requirements, dependency examples, comparisons, or historical references, as stale product release references. A separate no-tools audit query judges each original-to-read-back transformation rather than accepting the producing query's result or final content alone as evidence.

## Invariants

- Every configured document path resolves canonically to a regular non-symlink file inside the product working tree.
- The producing query writes only inside the isolated staging workspace; product documentation changes only through the promotion boundary after complete-set validation.
- The audit input is exactly the shared release data and the configured document set paired by path with original and staged read-back content.
- Promotion writes the complete staged set only when every current product document equals the original content supplied to the faithfulness audit.
- Structural version validation rejects only the exact standalone previous product release-version token derived from `ReleaseData.previousTag`; larger non-whitespace tokens and every other semantic version are outside that stale-reference predicate.

## Verification

### Testing

- ALWAYS: omitted `release.documentation.paths` resolves to the product README and every configured non-empty path set resolves in declared order without duplicates ([property])
- ALWAYS: every staged document contains the released version and, when `ReleaseData.previousTag` exists, contains no exact reference to that previous product release version before the faithfulness audit and promotion run ([compliance])
- ALWAYS: the faithfulness audit receives the original and staged read-back content for every configured document path before promotion runs ([compliance])
- ALWAYS: promotion receives the audited original and staged read-back content for every configured document, verifies the complete current set against those originals before its first write, and rejects the complete staged set when any current document has drifted ([compliance])
- ALWAYS: structural version validation preserves every semantic version other than the exact standalone previous product release-version token derived from `ReleaseData.previousTag`, including exact release values embedded in larger non-whitespace tokens ([property])
- ALWAYS: path traversal, canonical escape, final symlink, missing file, directory target, failed generation, failed read-back, failed version validation, and rejected faithfulness audit leave product documentation unpromoted ([compliance])
- NEVER: promote any document until the complete configured set has passed read-back, version validation, and faithfulness audit ([compliance])

### Audit

- ALWAYS: the release domain exports a typed `ConfigDescriptor` for the `release` section and the config registry imports it statically ([audit])
- ALWAYS: pure documentation-set resolution, prompt assembly, version validation, and orchestration live under `src/domains/release/`; filesystem effects live behind injected command-layer boundaries; Commander composition lives in `src/interfaces/cli/release.ts` ([audit])
- ALWAYS: release-version identity enters structural validation through the shared typed `ReleaseData` contract rather than document-shape heuristics or a test-owned version grammar ([audit])
- ALWAYS: the producer and faithfulness auditor use distinct injected interfaces and distinct Claude Agent SDK queries; the producing query returns no verdict and the audit query receives no tools ([audit])
- NEVER: direct filesystem access, config-file parsing, process access, or model access occurs inside the documentation-sync domain composition ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, filesystem mocking, or framework-level module replacement substitutes for agent, configuration, filesystem, audit, staging, or promotion dependencies ([audit])
