PROVIDES a kind-agnostic result-delivery library — given a rendered body, a marker, and a result scope, it resolves the environment-bound backend and delivers the body to it, upserting one surface per marker
SO THAT the delivery of agentic verification run projections, the validation domain, and the testing domain
CAN publish a rendered result to where consumers watch for it — a local surface, a GitHub pull-request comment, a GitLab merge-request note, or an observability sink — without holding backend-specific I/O or naming a result kind

## Assertions

### Mappings

- The environment maps to the delivery backend: an unset selector outside continuous integration, or the local selector, binds the local backend; a continuous-integration run targeting a GitHub pull request, or an explicit backend selector, binds that backend; an unrecognized selector is rejected naming the value and the registered backends ([test](tests/backend-selection.mapping.l1.test.ts))

### Conformance

- spx delivers the body to the backend as the consumer rendered it, adding only the addressing needed to find the surface again — parsing, validating, or transforming nothing ([test](tests/passthrough.conformance.l1.test.ts))

### Compliance

- ALWAYS: a delivery resolves the backend from the environment and routes the body through the backend's injected client ([test](tests/backend-resolution.compliance.l1.test.ts))
- ALWAYS: a first delivery for a marker creates the backend surface, and a later delivery for that marker updates it in place ([test](tests/upsert.compliance.l1.test.ts))
- NEVER: the library holds a backend API or CLI call of its own — backend I/O routes through the injected client ([audit])
- NEVER: the library references a verification type or result kind — the body and marker are opaque ([audit])
