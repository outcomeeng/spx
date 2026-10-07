---
id: { UUIDv7 }
malleability: { spec | verification | implementation; omit for implementation }
---

# {Node name}

ADAPTS {the provider — the domain or capability this interface makes consumable}
FOR {the consumption context — the medium-agnostic use the contract serves, never a consumer node or a surface by name}
SO THAT {who consumes the contract}
CAN {what they can do through its resources, verbs, selectors, payload shapes, lifecycle, and error semantics}

## Assertions

Authoring form: state new assertions directly here without tags or headings until verification selection. Draft and routed assertions may coexist. Declaration approval supplies no evidence result or Passing state. The grouped examples below show the routed form; its tag requirements follow declared malleability.

Only include assertion type headings that apply to this node. A spec-malleable assertion may omit its tag. An interface owns no rendering.

### Conformance

- {payload, resource, or error shape} conforms to {declared contract or schema} ([test](tests/{subject}.{evidence}.l1.test.{ext}))

### Mappings

- {verb and selector} maps to {resource and result} ([test](tests/{subject}.{evidence}.l1.test.{ext}))

### Scenarios

- Given {context}, when {lifecycle step}, then {result or error semantics} ([test](tests/{subject}.{evidence}.l1.test.{ext}))

### Compliance

- ALWAYS: {contract guarantee} — {why} ([test](tests/{subject}.{evidence}.l1.test.{ext}))
- NEVER: {rendering or medium-specific behavior} — {why} ([test](tests/{subject}.{evidence}.l1.test.{ext}))
- ALWAYS: {semantic constraint requiring judgment} — {why} ([audit:{rule-slug}])
