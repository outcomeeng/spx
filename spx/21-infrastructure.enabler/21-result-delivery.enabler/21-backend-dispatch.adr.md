# Result-Delivery Backend Dispatch

The result-delivery library is built as a port-and-adapter under `src/lib/result-delivery/`: a typed delivery port that every delivery routes through, a backend resolved once from an environment snapshot at the edge and injected as that port's implementation, and a local backend that persists one marker-addressed surface through the state module of `spx/17-state.adr.md` over an injected filesystem. The library names no backend's API and issues no backend call of its own; each non-local backend's construction — authentication, API or CLI mechanics, the per-surface write — is decided in that backend's own ADR and supplied to consumers as an injected capability.

## Rationale

A single delivery port with injected backends keeps the library's own logic — environment-to-backend resolution, marker addressing, the deliver call — verifiable over a controlled backend and a controlled filesystem without standing up `gh` or a network, and lets a new backend join by implementing the port rather than editing the library. Resolving the backend once at the edge from an environment snapshot mirrors the journal channel of `spx/60-surfaces.enabler/21-cli-surface.enabler/21-journal.enabler/11-journal-channel.adr.md`, so the same invocation works across environments and the library carries no per-environment branch in its core. Routing the local backend's persistence through the state module of `spx/17-state.adr.md` keeps `.spx/` layout and git topology resolved in one place rather than re-derived here. Deferring each non-local backend's construction to its own ADR keeps this node's decision to the port and the local adapter; folding the GitHub adapter's `gh` mechanics into result delivery, a journal command handler, or a CLI descriptor would couple a kind-agnostic surface to one backend's I/O.

Rejected: a delivery function that branches on backend kind internally — it rebuilds the per-backend coupling the port removes and reopens a network or `gh` boundary inside the library. Rejected: module-level interception of the filesystem or `gh` — it hides the boundary the injected dependencies make explicit, against `spx/17-state.adr.md`.

## Invariants

- Every delivery routes through the injected backend port; the library holds no backend-specific I/O.
- Backend resolution is a pure function of the environment snapshot.

## Verification

### Audit

- ALWAYS: the result-delivery library lives under `src/lib/result-delivery/` and exposes a typed delivery port — deliver a rendered body under a marker — that every delivery routes through, with backends supplied as injected implementations of that port ([audit])
- ALWAYS: backend selection is a pure function of an environment snapshot resolved once at the edge, mirroring the environment-bound backend selection of `spx/60-surfaces.enabler/21-cli-surface.enabler/21-journal.enabler/11-journal-channel.adr.md`, and the resolved backend is injected into the delivery call ([audit])
- ALWAYS: the local backend persists its marker-addressed surface through the state module of `spx/17-state.adr.md` over an injected filesystem interface, re-deriving no git topology or `.spx/` layout ([audit])
- ALWAYS: each non-local backend's construction — authentication, API or CLI mechanics, and the per-surface write — is decided in that backend's own ADR, not in this node ([audit])
- ALWAYS: commands and CLI descriptors consume result-delivery backends through injected delivery capabilities rather than constructing hosted backend transport directly ([audit])
- NEVER: the result-delivery library issues a `gh`, network, or other backend API or CLI call of its own — backend I/O lives only behind the injected backend port ([audit])
- NEVER: the library references a verification-type or result-kind name, per `spx/60-surfaces.enabler/21-cli-surface.enabler/21-journal.enabler/11-journal-channel.adr.md` ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or `memfs` substitutes for the filesystem or backend boundary — tests inject controlled implementations and exercise the real library code paths ([audit])
