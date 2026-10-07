---
id: { UUIDv7 }
malleability: { spec | verification | implementation; omit for implementation }
---

# {Node name}

EXPOSES {the outside-facing grammar, rendering, invocation, and protocol this surface provides}
TO {the external audience or boundary — the people, systems, or agents outside the product that use it}
SO THAT {that audience}
CAN {what they can do at this boundary}

## Assertions

Authoring form: state new assertions directly here without tags or headings until verification selection. Draft and routed assertions may coexist. Declaration approval supplies no evidence result or Passing state. The grouped examples below show the routed form; its tag requirements follow declared malleability.

Only include assertion type headings that apply to this node. A spec-malleable assertion may omit its tag. A surface owns no product-domain semantics; a family surface states the shared audience, affordance class, packaging promise, and the contract that selects among its concrete children.

### Scenarios

- Given {context}, when {invocation}, then {rendered result} ([test](tests/{subject}.{evidence}.l1.test.{ext}))

### Conformance

- {rendered output or protocol message} conforms to {standard or schema} ([test](tests/{subject}.{evidence}.l1.test.{ext}))

### Mappings

- {invocation form} maps to {rendering or protocol behavior} ([test](tests/{subject}.{evidence}.l1.test.{ext}))

### Compliance

- ALWAYS: {boundary guarantee} — {why} ([test](tests/{subject}.{evidence}.l1.test.{ext}))
- NEVER: {product semantics owned here} — {why} ([test](tests/{subject}.{evidence}.l1.test.{ext}))
- ALWAYS: {claim only observing the running surface settles} ([probe](probes/{probe-slug}/probe.md))
- ALWAYS: {semantic constraint requiring judgment} — {why} ([audit:{rule-slug}])
