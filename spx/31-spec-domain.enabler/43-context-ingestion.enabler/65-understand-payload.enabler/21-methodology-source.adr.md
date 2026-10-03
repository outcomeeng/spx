# Methodology Source

Context ingestion obtains the Outcome Engineering foundation from spx's shipped methodology bundle. The reader selects spx's shipped `methodology/{MAJOR.MINOR}/{coding-agent}/spec-tree/` bundle from the exact methodology version declared by the product and the coding agent selected by `--coding-agent` or, without it, by the invocation markers. Each marker is established by a value that is neither empty nor whitespace-only in the invoking process environment: `CODEX_THREAD_ID` establishes the Codex marker, and `CLAUDE_SESSION_ID` and `CLAUDE_ENV_FILE` each establish a Claude marker. `CODEX_THREAD_ID` takes precedence over `CLAUDE_SESSION_ID`, which takes precedence over `CLAUDE_ENV_FILE`. With no marker established, the single coding agent the line ships is selected, and several shipped agents fail as ambiguous. It reads `skills/understand/manifest.json` at schema version 1 and resolves the singular `core` path through the bundle containment boundary.

When `show --methodology` is requested, the core's complete body after skill-runtime front matter is framed as one Full document. Its displayed path is the bundle address followed by the manifest's `core` value, relative to spx's package root; it identifies a shipped resource, never a consumer-product target. `manifest.json`, `source.json`, references, templates, and examples remain internal selection, provenance, and on-demand catalog data and are absent from `show` output. A core-relative reference resolves against the bundle path carried by the core's document frame.

## Rationale

The reviewed, agent-specific foundation ships inside spx. Reusing its manifest preserves offline, deterministic selection and avoids another methodology layout, consumer copy, installed-plugin dependency, or network lookup. Rendering the eager core alone matches the foundation boundary: extended resources remain available when a workflow explicitly asks for them and do not inflate every context load.

## Invariants

- Tree selection is a function only of spx's package root, the declared methodology line, and the coding agent in scope.
- The core body equals the strict UTF-8 body of the manifest-named resource after its front matter.
- The displayed resource path is stable across installation locations and is never resolved against the consumer product root.
- No fallback source exists.
- `show` emits no methodology manifest, provenance record, or catalog entry.

## Verification

### Testing

- ALWAYS: the manifest schema is validated before output ([compliance])
- ALWAYS: core containment is validated before output ([compliance])
- ALWAYS: strict UTF-8 decoding is validated before output ([compliance])
- ALWAYS: configured `provides` and `supports` compatibility is validated before output ([compliance])
- ALWAYS: an absent line, agent tree, manifest, supported schema, or contained core fails the complete projection with the typed methodology failure ([mapping])

### Audit

- NEVER: methodology selection scans directories, compares package versions, reaches the network, reads an installed plugin or cache, or reads a consumer-side copy ([audit])
- ALWAYS: methodology parsing and validation are pure over supplied bytes ([audit])
- ALWAYS: methodology tree reads enter through the injected methodology reader rooted at spx's package root ([audit])
