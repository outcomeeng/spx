# File Inclusion

PROVIDES the unified path-scoping service — layered inclusion decisions composed from configured ignore sources, predicate evaluation, explicit-caller-override semantics, and per-tool flag adaptation
SO THAT every spx command, module, walker, and quality-gate consumer determining which filesystem paths participate in downstream tool invocation or internal traversal
CAN obtain a normalized inclusion decision with per-path decision trail and tool-adapted ignore arguments through one integration point

## Assertions

### Scenarios

- Given a caller supplies explicit paths to the scope resolver, when scope resolution completes, then every supplied path is reported as included and its decision trail names the explicit-override layer regardless of membership in any ignore source or artifact set ([test](tests/file-inclusion.scenario.l1.test.ts))
- Given a caller requests a walked scope without explicit paths, when the resolver completes traversal, then entries under any configured ignore source, any configured artifact-directory name, and any entry whose basename starts with the configured hidden prefix are excluded, and each excluded path carries a decision trail naming the responsible layer ([test](tests/file-inclusion.scenario.l1.test.ts))
- Given a resolved scope is converted to invocation arguments for a registered tool, when the adapter runs, then the returned flags reference the resolved excluded set in the tool's native ignore syntax and reference no other paths ([test](tests/file-inclusion.scenario.l1.test.ts))

### Compliance

- ALWAYS: every spx consumer that invokes a downstream tool with file-scope arguments obtains those arguments through a file-inclusion tool adapter — consumers neither format tool-specific ignore-flag syntax nor enumerate paths that match a filter layer ([review])
- ALWAYS: every path literal with product meaning consumed inside the file-inclusion subtree — the spec-tree root segment, the ignore-source filename, the gitignore filename, the artifact-directory name set, and the hidden-prefix character — is resolved through a 16-config descriptor; no module reads these values from source text ([review])
- NEVER: a module outside the file-inclusion subtree parses an ignore-source file, enumerates an artifact-directory name set, hand-rolls per-tool ignore-flag syntax, or reads a gitignore file — every such responsibility lives inside this subtree and is accessed through its public API ([review])
- NEVER: an explicit caller-supplied path be dropped, rewritten, or ignored by any filter layer — explicit paths express caller intent and bypass every ignore layer ([test](tests/file-inclusion.scenario.l1.test.ts))
