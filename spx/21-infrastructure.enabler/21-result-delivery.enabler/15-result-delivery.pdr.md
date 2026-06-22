# Result Delivery

spx delivers a verification, validation, or test result to where its consumers watch for it: given a rendered body, a marker, and a result scope, an agent or command hands spx the result and spx publishes it to the backend the environment binds — a local surface, a GitHub pull-request comment, a GitLab merge-request note, or an observability sink — upserting one surface per marker so a re-delivery updates it in place rather than accumulating. The consumer renders the body; spx delivers it and names no result kind.

## Rationale

Every result a run surfaces — an agentic verification projection, a validation report, a test report — shares one delivery concern: reach the place its consumers watch, address it idempotently, and authenticate to it. The consumer owns the result vocabulary and renders the body; spx owns delivery, so the backend mechanics — authentication, pagination, idempotent upsert, the per-surface write — live in one place rather than re-derived per result kind or rebuilt in each consuming tool. A consumer that depends on neither a backend SDK nor a backend CLI still delivers by handing spx a body. Naming no result kind keeps the capability open to a new verification type or a new result without a delivery change, consistent with the type-agnostic journal channel of `spx/34-verification.enabler/13-journal-channel.adr.md`. Construction — which backend the environment binds, how each backend authenticates and writes — is decided per backend in the backend nodes, not here.

## Product properties

1. A re-delivery for the same marker updates one surface in place, so consumers see one current result rather than an accumulation.
2. The same result reaches the same shape on every backend, because the consumer renders the body once and spx delivers it unchanged.
3. Backend selection is bound by the environment, so a consumer names no backend.

## Verification

### Testing

- ALWAYS: a first delivery for a marker creates the surface, and a later delivery for that marker updates it in place rather than creating a second ([compliance])
- ALWAYS: the environment binds the backend — the local surface by default, the hosted backend its environment selects — with no backend named by the consumer ([mapping])
- ALWAYS: spx delivers the body to the backend as the consumer rendered it, adding only the addressing it needs to find the surface again — parsing, validating, or transforming nothing ([conformance])

### Audit

- ALWAYS: a consumer hands spx a rendered body, a marker, and a result scope, and spx delivers it — the consumer issues no backend API or CLI call of its own ([audit])
- NEVER: result delivery names a verification type or result kind — the body and marker are opaque, per `spx/34-verification.enabler/13-journal-channel.adr.md` ([audit])
