# Result Delivery

spx delivers a verification, validation, or test result to where its consumers watch for it: given a rendered body, a marker, and a result scope, an agent or command hands spx the result and spx publishes it to the backend the environment binds — a local surface, a GitHub pull-request comment, a GitLab merge-request note, or an observability sink — upserting one surface per marker so a re-delivery updates it in place rather than accumulating. The consumer renders the body; spx delivers it and names no result kind. This product behavior is independent of the command that produced the body and independent of the invocation host that wired the backend capability.

## Rationale

Every result a run surfaces — an agentic verification projection, a validation report, a test report — shares one delivery concern: reach the place its consumers watch and keep one current surface per marker. The consumer owns the result vocabulary and renders the body; spx owns delivery. Naming no result kind keeps the capability open to a new verification type or a new result without a delivery change, consistent with the type-agnostic journal channel of `spx/60-surfaces.enabler/21-cli-surface.enabler/21-journal.enabler/11-journal-channel.adr.md`.

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

- ALWAYS: a consumer hands spx a rendered body, a marker, and a result scope, and spx delivers it without the consumer naming a backend ([audit])
- NEVER: result delivery names a verification type or result kind — the body and marker are opaque, per `spx/60-surfaces.enabler/21-cli-surface.enabler/21-journal.enabler/11-journal-channel.adr.md` ([audit])
