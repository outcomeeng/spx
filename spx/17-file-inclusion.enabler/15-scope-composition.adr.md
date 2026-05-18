# Scope Composition

## Purpose

This decision governs how the file-inclusion service composes its filter layers, how explicit-caller override interacts with the composed layers, and how the composed result crosses the boundary to per-tool invocation. It applies to every module in the `17-file-inclusion.enabler/` subtree and to every consumer that integrates with the service's public API.

## Context

**Business impact:** The default-ignore policy (`11-ignore-defaults.pdr.md`) names what the service filters and what the caller can override; this decision names how those filters run and produce a result that external tools can consume. Without a consistent composition shape, each consumer integrates differently, each adapter re-derives which paths to exclude, and the drift class the service exists to prevent returns through the architecture itself.

**Technical constraints:** spx is TypeScript ESM. The git-tracking layer queries git plumbing once per resolver invocation and exposes the result as an in-memory set; downstream evaluation is pure over `(path, layerState)`. Domain path filters are resolved by registered config descriptors and passed to file-inclusion as typed inputs. Root resolution follows `spx/15-worktree-resolution.pdr.md` — tracked-file reads use `git rev-parse --show-toplevel`, passed in as `productDir`. Every vocabulary constant the file-inclusion subtree owns comes from the file-inclusion config descriptor per `spx/16-config.enabler/21-descriptor-registration.adr.md`. Tool adapters produce argument arrays — no shelled-out invocations, no string concatenation into flag syntax.

## Decision

The file-inclusion service composes its filter layers as an ordered pipeline that runs once per invocation and produces a single `ScopeResult` with per-path decision trails. The pipeline's layer sequence — caller-supplied explicit paths, domain path filter, git-tracking — is declared at a single site, imported by the composer, and extensible: a new layer inserts at a declared position and preserves the decision-trail ordering and membership decisions of every existing layer. The git-tracking layer reads its state from a single git-plumbing query (`git ls-files --cached --others --exclude-standard --full-name`) at resolver construction; each layer's per-path predicate is then pure over `(path, layerState)`. Layer evaluation short-circuits on explicit-caller match, meaning caller-supplied paths bypass every other layer by construction rather than by per-layer logic. Tool adapters receive the `ScopeResult` and a tool name, produce that tool's ignore-flag arguments from the resolved excluded set, and never consult the filter layers themselves.

## Rationale

A fixed-order pipeline makes the layer interaction inspectable and stable. Consumers cannot alter the sequence, cannot skip shared layers, and cannot insert a layer of their own — which is exactly the behavior the default-ignore policy requires. Agents reasoning about "why was this path excluded" read the decision trail and find a single responsible layer; debugging a missing exclusion or a surprising inclusion reduces to examining that layer's configuration.

Short-circuiting on explicit-caller match inside the pipeline — rather than having each downstream layer check "was this path caller-supplied?" — encodes the override invariant once, at the architecture boundary, and makes every layer local-reasoning-safe. A layer predicate answers only "is this path in my filter set?"; it never answers "should this path be excluded given other context." The override semantics cannot leak into a layer's predicate and become gradually weakened by refactoring.

Domain path filters are caller-supplied policy inputs. Validation, testing, auditing, and reviewing can all pass the same structural config primitive into the pipeline while preserving separate meanings at their descriptor boundary. File inclusion records a decision trail entry for the path-filter layer; it does not decide whether that filter means quality-debt suppression, passing-scope selection, audit targeting, or review targeting.

The git-tracking layer reads its state once at resolver construction so that downstream predicate evaluation remains pure and synchronous over in-memory data. Shelling out to git per path would couple every membership check to a subprocess invocation and slow the pipeline by orders of magnitude; consulting `.gitignore` patterns directly inside spx would re-implement git's ignore-resolution logic and accumulate divergence from git's behavior over time. A single git invocation that returns the working tree's effective scope keeps the boundary thin and the implementation correct by construction.

Override flags (`--no-ignore`, `--no-ignore-vcs`, `--ignore-file`) modify the git-plumbing arguments at construction time — `--no-ignore` translates to omitting `--exclude-standard`, `--ignore-file <path>` translates to adding `--exclude-from <path>`. The layer's predicate shape is unchanged; only its constructed state differs. This keeps override semantics architecturally local to the git-tracking layer and avoids fanning override flags out as separate layers.

Tool adapters as a boundary between the resolved scope and external tool invocation separate two concerns that otherwise entangle: deciding which paths are in scope (universal across tools, owned by the pipeline) and how a specific tool receives that decision (tool-specific, owned by each adapter). The adapter pattern mirrors the descriptor-registration pattern from `../16-config.enabler/21-descriptor-registration.adr.md` and the language-registration pattern from `../19-language-registration.adr.md`: each adapter declares its tool's flag shape in one module, and the registry iterates adapters without naming tools in orchestration code.

Alternatives considered:

- **Predicate list evaluated left-to-right without explicit-override short-circuit.** Each layer would need to consult caller intent. Rejected because the override invariant becomes a per-layer obligation — easy to forget, easy to weaken when a layer's logic grows, and the drift class returns in a subtler form.
- **Layered decorator pattern with each layer wrapping the next.** Composition happens at assembly time rather than invocation time. Rejected because it hides the pipeline's linear structure behind chained calls and loses the per-path decision trail — a consumer debugging an exclusion reads multiple stack frames instead of a flat layer list.
- **Tool-specific scope resolution.** Each adapter resolves its own scope from the raw inputs. Rejected because it recreates the drift class — adapters would interpret the ignore-defaults policy independently, and the single-source invariant vanishes.
- **Caller-chosen layer sequence.** Consumers declare which layers to apply and in what order. Rejected because the default-ignore policy is a product decision, not a consumer configuration; letting each call site reorder layers is exactly the drift-producing architecture the file-inclusion service replaces.
- **Per-path `git check-ignore` invocation.** Each membership query shells out to git. Rejected because the subprocess overhead dominates the pipeline cost; a single `git ls-files` invocation returns the entire effective scope and supports the same per-path queries in O(1) against an in-memory set.
- **Override flags as separate pipeline layers.** `--no-ignore`, `--no-ignore-vcs`, and `--ignore-file` each declared as their own layer that runs after git-tracking and re-includes or further excludes entries. Rejected because the override semantics are about how the git-tracking layer constructs its state, not about composing additional filter passes; folding overrides into the git-tracking layer's construction keeps the layer count minimal and the behavior easy to reason about.

## Trade-offs accepted

| Trade-off                                                                            | Mitigation / reasoning                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pipeline composition is not pluggable at the consumer boundary                       | The pipeline's purpose is to encode a product-level decision; consumer-level pluggability would reintroduce the drift class                                                                                                                             |
| Adding a new tool requires a new adapter module                                      | Tool adapters are small (one flag format per tool) and the registry composition follows the descriptor pattern already established in the harness                                                                                                       |
| Per-path decision trails increase the size of `ScopeResult` versus a raw include set | Debugging and diagnostics are dominant use cases for scope resolution; a decision-trail-free result would be cheaper but would require a second traversal to explain exclusions                                                                         |
| Git-tracking layer requires a git working tree at resolver construction              | `spx/15-worktree-resolution.pdr.md` already requires git; the construction phase fails fast with an actionable error when no git repository is present                                                                                                  |
| Override flags are wired through the git-tracking layer's construction               | Keeps the layer count minimal and the architectural surface stable; downstream layers do not need to know that overrides exist                                                                                                                          |
| Architecture rules for descriptor-owned vocabulary are restated here                 | The rules apply at file-inclusion subtree boundaries, which `../16-config.enabler/21-descriptor-registration.adr.md` governs generically; restating them here anchors the architectural contract locally and makes file-inclusion audits self-contained |

## Invariants

- A caller-supplied explicit path always reaches `ScopeResult.included` with a decision trail whose first element names the explicit-override layer, regardless of any other layer's membership
- For every path not supplied as an explicit caller path, the pipeline evaluates each non-override layer in the declared sequence, and the path's decision trail contains exactly those layers that matched (one entry per matching layer, in pipeline order)
- Tool adapters are pure over `(ScopeResult, ToolName)` — the same resolved scope and the same tool name always produce the same argument array, regardless of which tool was adapted previously in the process
- The pipeline's layer sequence is declared in one place and consumed through a single accessor; no module outside the pipeline composes its own layer order
- The layer sequence is extensible: inserting a new layer at a declared position preserves the decision-trail ordering and membership decisions of every existing layer
- The git-tracking layer's state is built from a single git-plumbing invocation per resolver construction; per-path membership queries are O(1) lookups against an in-memory set
- Override flags (`--no-ignore`, `--no-ignore-vcs`, `--ignore-file`) modify the git-tracking layer's construction-time arguments and do not introduce additional layers
- Every vocabulary constant the file-inclusion subtree consumes is declared in the file-inclusion config descriptor; the spec-tree root segment is consumed from the spec-tree descriptor per `spx/23-spec-tree.enabler/`
- No module outside the file-inclusion subtree composes its own scope from git plumbing or invents its own exclusion mechanics

## Compliance

### Recognized by

One module declares the layer sequence. One module composes layers into the pipeline. One module per tool declares that tool's adapter. A registry imports each adapter through an explicit static import and exposes adapters by tool name. The public API of the file-inclusion service exposes `resolveScope(productDir, request)` and `toToolArguments(scopeResult, toolName)`; consumers never reach into layer modules directly.

### MUST

- The layer sequence is declared in one module inside the file-inclusion subtree, imported by the pipeline composer, and consumed by no other module ([review])
- Explicit-caller override short-circuits the pipeline — the override is a property of the pipeline's composition, not a per-layer obligation ([review])
- Each filter layer is a pure predicate typed as `(path: string, state: LayerState) => LayerDecision`; layers perform no filesystem I/O at evaluation time — any I/O happens at construction time ([review])
- The git-tracking layer constructs its `LayerState` from a single `git ls-files --cached --others --exclude-standard --full-name` invocation against the worktree resolved per `spx/15-worktree-resolution.pdr.md` ([review])
- Each tool adapter is declared in its own module as a pure function over `(ScopeResult, AdapterConfig) => readonly string[]` and registered through the adapter registry's static import list ([review])
- `ScopeResult` carries a per-path decision trail — the sequence of layers that matched the path, in pipeline order, with the first element being `explicit-override` when the path was supplied by the caller ([review])
- The layer-sequence declaration accepts insertion of a new layer at any declared position; inserting a layer does not alter the decision trails of other layers or the included/excluded membership of other layers' matches ([test](43-scope-resolver.enabler/tests/scope-resolver.property.l1.test.ts))
- Every file-inclusion vocabulary constant the subtree consumes is read through a 16-config-registered descriptor at every use site ([review](../16-config.enabler/21-descriptor-registration.adr.md))

### NEVER

- Allow a consumer to reorder, skip shared layers, or replace layers in the pipeline — the sequence is architectural and fixed ([review])
- Let a layer predicate consult caller intent — layer predicates are local-reasoning-safe over `(path, layerState)` alone ([review])
- Shell out to git inside a layer predicate — git invocations happen at construction time; per-path evaluation is pure over the constructed state ([review])
- Reimplement git's ignore-resolution logic inside spx — spx delegates the ignore-source semantics to git plumbing rather than parsing `.gitignore`, `.git/info/exclude`, or `core.excludesFile` directly ([review])
- Introduce a tool adapter that consults the filter layers directly — adapters read `ScopeResult` and nothing else ([review])
- Produce a `ScopeResult` without per-path decision trails — the trail is the observable record of the pipeline's decision ([review])
- `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — tests use real fixtures under tmpdirs through `../22-test-environment.enabler/` ([review])
- Compose scope from any source other than git plumbing, consumer-supplied domain filters, or explicit-caller paths — there is no fourth source ([review])
- Read git plumbing or compose default exclusions from any module outside the file-inclusion subtree — the source-of-scope vocabulary lives here and here alone ([review])
- Introduce a second default filter layer outside the file-inclusion subtree — the default set lives in this subtree and this subtree alone ([review])
