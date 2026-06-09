# Scope Composition

The file-inclusion service composes its filter layers as a fixed-order pipeline that runs once per invocation and produces a single `ScopeResult` with per-path decision trails, short-circuiting on explicit-caller match so caller paths bypass every other layer by construction. Tool adapters consume the `ScopeResult` and a tool name to produce that tool's ignore-flag arguments and never consult the filter layers themselves.

## Rationale

A fixed-order pipeline makes the layer interaction inspectable and stable — consumers cannot reorder, skip, or insert layers, which is exactly what the default-ignore policy (`spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md`) requires, and an agent debugging "why was this path excluded" reads the decision trail to a single responsible layer. Short-circuiting on explicit-caller match inside the pipeline encodes the override invariant once at the architecture boundary, so each layer predicate answers only "is this path in my filter set?" and the override semantics cannot leak into a layer and weaken under refactoring. The git-tracking layer reads its state once at construction so downstream evaluation stays pure and synchronous; shelling out per path would couple every membership check to a subprocess, and parsing `.gitignore` directly would re-implement git's ignore resolution and drift from it. Override flags modify the git-plumbing arguments at construction time (`--no-ignore` omits `--exclude-standard`, `--ignore-file <path>` adds `--exclude-from <path>`, `--no-ignore-vcs` omits `--exclude-standard` and re-adds the non-VCS sources as explicit `--exclude-from` arguments — the precise per-flag translation owned by `spx/17-file-inclusion.enabler/21-ignore-source.enabler/21-reader-shape.adr.md`), so override semantics stay local to the git-tracking layer rather than fanning out as extra layers. Tool adapters separate "which paths are in scope" (universal, owned by the pipeline) from "how a tool receives that decision" (tool-specific), mirroring the descriptor-registration pattern of `spx/16-config.enabler/21-descriptor-registration.adr.md` and the language-registration pattern of `spx/19-language-registration.adr.md`. The service's public API is `resolveScope(productDir, request, config)` and `toToolArguments(scopeResult, toolName)`, which consumers use without reaching into layer modules; these rules govern every module in the `spx/17-file-inclusion.enabler/` subtree and every consumer of that API.

Rejected: a predicate list without explicit-override short-circuit (makes the override a per-layer obligation that drifts); a layered decorator pattern (hides the linear structure and loses the flat decision trail); tool-specific scope resolution (adapters reinterpret the ignore policy independently, recreating the drift class); a caller-chosen layer sequence (the default-ignore policy is a product decision, not consumer configuration); per-path `git check-ignore` (subprocess overhead dominates versus one `git ls-files` query); and override flags as separate pipeline layers (overrides are about how the git-tracking layer constructs its state, not additional filter passes).

## Invariants

- A caller-supplied explicit path always reaches `ScopeResult.included` with a decision trail whose first element names the explicit-override layer, regardless of any other layer's membership.
- For every path not supplied explicitly, the pipeline evaluates each non-override layer in the declared sequence, and the path's decision trail contains exactly those layers that matched, one entry per matching layer in pipeline order.
- Tool adapters are pure over `(ScopeResult, ToolName)` — the same resolved scope and tool name always produce the same argument array.
- The pipeline's layer sequence — caller-supplied explicit paths, then domain path filter, then git-tracking — is declared in one place and consumed through a single accessor; no module outside the pipeline composes its own layer order.
- The layer sequence is extensible: inserting a new layer at a declared position preserves the decision-trail ordering and membership decisions of every existing layer.
- The git-tracking layer's state is built by git-plumbing invocations at resolver construction only; per-path membership queries are O(1) lookups against an in-memory set and invoke no subprocess.
- Override flags (`--no-ignore`, `--no-ignore-vcs`, `--ignore-file`) modify the git-tracking layer's construction-time arguments and do not introduce additional layers.
- Every vocabulary constant the file-inclusion subtree consumes is declared in the file-inclusion config descriptor; the spec-tree root segment is consumed from the spec-tree descriptor per `spx/23-spec-tree.enabler/`.
- No module outside the file-inclusion subtree composes its own scope from git plumbing or invents its own exclusion mechanics.

## Verification

### Testing

- ALWAYS: the layer-sequence declaration accepts insertion of a new layer at any declared position; inserting a layer does not alter the decision trails or the included/excluded membership of other layers' matches ([property])

### Audit

- ALWAYS: the layer sequence is declared in one module inside the file-inclusion subtree, imported by the pipeline composer, and consumed by no other module ([audit])
- ALWAYS: explicit-caller override short-circuits the pipeline — the override is a property of the pipeline's composition, not a per-layer obligation ([audit])
- ALWAYS: each filter layer is a pure predicate typed `(path: string, state: LayerState) => LayerDecision`; layers perform no filesystem I/O at evaluation time — any I/O happens at construction time ([audit])
- ALWAYS: the git-tracking layer constructs its `LayerState` from a single `git ls-files --cached --others --exclude-standard --full-name` invocation against the worktree resolved per `spx/15-worktree-management.pdr.md` ([audit])
- ALWAYS: each tool adapter is declared in its own module as a pure function over `(ScopeResult, AdapterConfig) => readonly string[]` and registered through the adapter registry's static import list ([audit])
- ALWAYS: `ScopeResult` carries a per-path decision trail — the layers that matched the path, in pipeline order, with the first element `explicit-override` when the path was caller-supplied ([audit])
- ALWAYS: every file-inclusion vocabulary constant the subtree consumes is read through a descriptor registered per `spx/16-config.enabler/21-descriptor-registration.adr.md` at every use site ([audit])
- NEVER: allow a consumer to reorder, skip shared layers, or replace layers in the pipeline — the sequence is architectural and fixed ([audit])
- NEVER: let a layer predicate consult caller intent — layer predicates are local-reasoning-safe over `(path, layerState)` alone ([audit])
- NEVER: shell out to git inside a layer predicate — git invocations happen at construction time; per-path evaluation is pure over the constructed state ([audit])
- NEVER: reimplement git's ignore-resolution logic inside spx — spx delegates ignore-source semantics to git plumbing rather than parsing `.gitignore`, `.git/info/exclude`, or `core.excludesFile` directly ([audit])
- NEVER: introduce a tool adapter that consults the filter layers directly — adapters read `ScopeResult` and nothing else ([audit])
- NEVER: produce a `ScopeResult` without per-path decision trails — the trail is the observable record of the pipeline's decision ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — tests use real fixtures under temp dirs through `spx/22-test-environment.enabler/` ([audit])
- NEVER: compose scope from any source other than git plumbing, consumer-supplied domain filters, or explicit-caller paths — there is no fourth source ([audit])
- NEVER: read git plumbing or compose default exclusions from any module outside the file-inclusion subtree — the source-of-scope vocabulary lives here alone ([audit])
- NEVER: introduce a second default filter layer outside the file-inclusion subtree — the default set lives in this subtree alone ([audit])
