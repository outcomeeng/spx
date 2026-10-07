---
id: { UUIDv7 }
malleability: { spec | verification | implementation; omit for implementation }
---

# {Variant name}

{The opening of the parent's kind — SUPPLIES, PROVIDES, OWNS, ADAPTS ... FOR, or EXPOSES ... TO — restating the parent's whole contract as this variant implements it}
SO THAT {the parent's consumption context}
CAN {the parent's consumer capability}

## Assertions

Authoring form: state new assertions directly here without tags or headings until verification selection. Draft and routed assertions may coexist. Declaration approval supplies no evidence result or Passing state. The grouped examples below show the routed form; its tag requirements follow declared malleability.

State only what the parent's contract does not say. The parent's assertions are this variant's evidence too: the toolchain runs them once with the selection source set to this variant and records the results in this variant's status claim. A variant carries no outcome record.

### Scenarios

- Given {context specific to this implementation}, when {action}, then {result} ([test](tests/{subject}.{evidence}.l1.test.{ext}))

### Compliance

- ALWAYS: {behavior this implementation guarantees beyond the contract} — {why} ([test](tests/{subject}.{evidence}.l1.test.{ext}))
- ALWAYS: {claim only observing this variant running settles} ([probe](probes/{probe-slug}/probe.md))
