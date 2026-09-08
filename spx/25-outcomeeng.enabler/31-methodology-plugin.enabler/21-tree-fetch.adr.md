# Tree Fetch and Resolution

The shipped methodology trees are addressed by one library, `src/lib/methodology/tree.ts`, which owns the layout grammar — `methodology/{MAJOR.MINOR}/{coding-agent}/spec-tree/`, the line derived from an exact methodology version by a pure parse, the `source.json` record beside each line, and the plain-segment constraint on every path component — and resolves a tree from an explicitly supplied tree root, never from the product directory. The tree root is a host fact: `src/cli.ts` derives spx's package root from its own module location, the same derivation it uses for `package.json`, and the CLI-interface layer passes the root into every command handler that reads a tree as an injected value, so the spec-context handler, the hook adapter, and the diagnose probe receive a root and never compute one. The fetch is repository tooling, not shipped CLI surface: `scripts/fetch-methodology.ts` is a thin entry that composes `src/lib/methodology/fetch.ts`, whose planning — argument parsing, line derivation from the fetched plugin manifests' `methodology.provides`, the per-agent copy set, and the `source.json` content — is pure over supplied values, and whose two effects — a sparse, blobless git clone at one revision and the replacement of the target line directory — enter through an injected git runner and an injected filesystem interface. Manifest, `source.json`, and resource reads share one contained-read boundary rooted at the resolved tree, so a resource path binds a read only when it resolves inside that tree through any symbolic link.

## Rationale

One layout grammar in one module keeps the fetch, the three readers, and their tests on the same address; a second composition of `methodology/` paths anywhere else is the duplicated-capability shape `spx/14-cli-composition.adr.md` forbids. Deriving the line by a pure parse of the declared version removes any directory scan from resolution, so a missing line fails naming the declared version and the lines the root holds rather than picking a neighbor.

The tree root is injected rather than discovered because the library module's own location differs between the development entry, where it sits three directories below the package root, and the bundled executable, where the bundle sits one directory below it; only the entry module knows where it is, and it already resolves `package.json` that way. Threading the root through the CLI-interface layer follows `spx/13-cli.enabler/15-cli-architecture.adr.md`: adapting the invocation host into explicit command inputs is that layer's whole job, and a handler that computed the root from `import.meta.url` would bind itself to one packaging shape. Resolving the tree under the product directory is rejected because a consumer product commits no tree; resolving it from a coding agent's plugin cache is rejected by `spx/13-agent-capability-lifecycle.pdr.md` and by the governing node.

The fetch lives outside the shipped CLI because no consumer fetches the methodology — the tree ships inside the CLI — so a subcommand would be dead surface for every user. A sparse, blobless clone limited to `dist/{coding-agent}/spec-tree/` needs only git, which spx already requires, and resolves a branch, tag, or commit to one commit the record names; a tarball download is rejected because it needs an archive dependency and a second call to resolve the commit. The whole line directory is replaced rather than merged so a resource the provider removed does not linger, and byte identity for the same revision and line follows from copying the published bytes unchanged. Planning stays pure and effects stay injected so the fetch verifies against a local bare repository shaped like the plugins repository's `dist/` layout, with no network in any test.

## Invariants

- For every exact methodology version, the line is the first two dot-separated components; a version that does not parse yields a failure, never a directory name.
- Every path component under `methodology/` is a plain segment: non-empty, no separator, not `.` or `..`.
- A tree directory is a function of the tree root, the line, and the coding agent alone.
- For the same revision and line, the fetch produces byte-identical `methodology/{MAJOR.MINOR}/` content and `source.json`.
- A resource path binds a read only when its canonical location lies inside the canonical tree directory.

## Verification

### Testing

- ALWAYS: the methodology line is derived from the declared version by a pure parse in `src/lib/methodology/tree.ts`: the first two dot-separated components of an exact version, and a failure for any value that is not an exact version ([property])
- ALWAYS: a tree read fails naming the declared version and the lines present under the root when the derived line directory is absent, and naming the coding agents present under the line when the agent directory is absent ([compliance])
- ALWAYS: `source.json` parses to a record carrying the repository, the resolved commit, and each coding agent's plugin name, version, and optional `provides` and `supports`; a malformed record fails the read naming the file ([conformance])
- ALWAYS: fetch planning — argument parsing, line derivation from `methodology.provides`, the copy set, and the `source.json` content — yields identical plans for identical plugin-manifest text and arguments ([property])
- ALWAYS: the fetch replaces the whole target line directory and writes nothing outside it ([compliance])

### Audit

- ALWAYS: `src/cli.ts` derives the package root from its own module location and the CLI-interface layer passes the tree root into command handlers as an explicit input ([audit])
- ALWAYS: the git clone and every filesystem effect of the fetch enter through injected interfaces, so the fetch verifies against a local bare repository shaped like the plugins repository's `dist/` layout ([audit])
- NEVER: a consumer scans `methodology/` to select a line; selection is the pure parse of the declared version ([audit])
- NEVER: a command handler, hook adapter, diagnose probe, or library module computes the tree root from `import.meta.url`, the product directory, or a coding agent's home ([audit])
- NEVER: a module outside `src/lib/methodology/` composes a `methodology/` path ([audit])
- NEVER: a test reaches the network, `vi.mock()`, `jest.mock()`, or filesystem module replacement to exercise the fetch or a tree read ([audit])
