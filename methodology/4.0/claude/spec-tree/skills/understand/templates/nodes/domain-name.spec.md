---
id: { UUIDv7 }
malleability: { spec | verification | implementation; omit for implementation }
---

# {Node name}

OWNS {the bounded semantic context — its vocabulary, rules, and invariants — that other nodes speak}
SO THAT {the consumption context — the kinds of nodes or the audience that speak it, never a consumer node by name}
CAN {what those consumers could not do without one owner of these semantics}

## Assertions

Authoring form: state new assertions directly here without tags or headings until verification selection. Draft and routed assertions may coexist. Declaration approval supplies no evidence result or Passing state. The grouped examples below show the routed form; its tag requirements follow declared malleability.

Only include assertion type headings that apply to this node. A spec-malleable assertion may omit its tag. A domain states its class contract — the rule its children satisfy and how their contributions combine — and names no child.

### Scenarios

- Given {context}, when {action}, then {result} ([test](tests/{subject}.{evidence}.l1.test.{ext}))

### Mappings

- {input set} maps to {output set} ([test](tests/{subject}.{evidence}.l1.test.{ext}))

### Properties

- {invariant of the domain's rules} holds for all {domain} ([test](tests/{subject}.{evidence}.l1.test.{ext}))

### Compliance

- ALWAYS: {rule every node speaking this vocabulary obeys} — {why} ([test](tests/{subject}.{evidence}.l1.test.{ext}))
- NEVER: {prohibited behavior} — {why} ([test](tests/{subject}.{evidence}.l1.test.{ext}))
- ALWAYS: {semantic constraint requiring judgment} — {why} ([audit:{rule-slug}])
