---
id: { UUIDv7 }
malleability: { spec | verification | implementation; omit for implementation }
---

# {Node name}

SUPPLIES {the primitive mechanics this substrate offers — runtime, process, filesystem, workflow, hook, or tool primitives, with no product-domain vocabulary}
SO THAT {the consumption context — the kinds of nodes that use it, never a consumer node by name}
CAN {what those consumers could not do without it}

## Assertions

Authoring form: state new assertions directly here without tags or headings until verification selection. Draft and routed assertions may coexist. Declaration approval supplies no evidence result or Passing state. The grouped examples below show the routed form; its tag requirements follow declared malleability.

Only include assertion type headings that apply to this node. A spec-malleable assertion may omit its tag.

### Scenarios

- Given {context}, when {action}, then {result} ([test](tests/{subject}.{evidence}.l1.test.{ext}))

### Mappings

- {input set} maps to {output set} ([test](tests/{subject}.{evidence}.l1.test.{ext}))

### Conformance

- {output} conforms to {standard or schema} ([test](tests/{subject}.{evidence}.l1.test.{ext}))

### Properties

- {invariant} holds for all {domain} ([test](tests/{subject}.{evidence}.l1.test.{ext}))

### Compliance

- ALWAYS: {observable behavior that holds} — {why} ([test](tests/{subject}.{evidence}.l1.test.{ext}))
- NEVER: {prohibited behavior} — {why} ([test](tests/{subject}.{evidence}.l1.test.{ext}))
- ALWAYS: {claim only observing the running node settles} ([probe](probes/{probe-slug}/probe.md))
- ALWAYS: {semantic constraint requiring judgment} — {why} ([audit:{rule-slug}])
