# File Inclusion

PROVIDES the unified path-scoping service — layered inclusion decisions composed from the git-tracking layer, consumer-supplied domain path filters, explicit-caller-override semantics, and per-tool flag adaptation
SO THAT every spx command, module, walker, and quality-gate consumer determining which filesystem paths participate in downstream tool invocation or internal traversal
CAN obtain a normalized inclusion decision with per-path decision trail and tool-adapted ignore arguments through one integration point

## Assertions

### Scenarios

- Given a caller supplies explicit paths to the scope resolver, when scope resolution completes, then every supplied path is reported as included and its decision trail names the explicit-override layer regardless of git's view or any domain path filter ([test](tests/file-inclusion.scenario.l1.test.ts))
- Given a caller requests a walked scope without explicit paths, when the resolver completes traversal, then entries git considers ignored under the working tree — through `.gitignore`, nested `.gitignore`, `.git/info/exclude`, or global gitignore — and entries inside a submodule are excluded, entries outside a configured include filter are excluded, entries matching a configured exclude filter are excluded, and each excluded path carries a decision trail naming the responsible layer ([test](tests/file-inclusion.scenario.l1.test.ts))
- Given a caller passes `--no-ignore` to a domain command that walks files, when the resolver runs, then entries that any git ignore source would otherwise exclude are included and the decision trail records the override on the git-tracking layer ([test](tests/file-inclusion.scenario.l1.test.ts))
- Given a resolved scope is converted to invocation arguments for a registered tool, when the adapter runs, then the returned flags reference the resolved excluded set in the tool's native ignore syntax and reference no other paths ([test](tests/file-inclusion.scenario.l1.test.ts))

### Compliance

- ALWAYS: every spx consumer that invokes a downstream tool with file-scope arguments obtains those arguments through a file-inclusion tool adapter — consumers neither format tool-specific ignore-flag syntax nor enumerate paths that match a filter layer ([review])
- ALWAYS: every path literal with product meaning consumed inside the file-inclusion subtree — the spec-tree root segment and any future descriptor-owned constants — is resolved through a config descriptor; no module reads these values from source text ([review])
- ALWAYS: the git-tracking layer is the single default scope source per `11-ignore-defaults.pdr.md`; no parallel artifact-directory list, hidden-prefix rule, or standalone ignore-source file decides default scope ([review])
- NEVER: a module outside the file-inclusion subtree shells out to git plumbing for scope, composes its own default exclusion set, or hand-rolls per-tool ignore-flag syntax — shared scope mechanics live inside this subtree and are accessed through its public API ([review])
- NEVER: an explicit caller-supplied path be dropped, rewritten, or ignored by any filter layer — explicit paths express caller intent and bypass every other layer ([test](tests/file-inclusion.scenario.l1.test.ts))
