# Plan: methodology configuration

## Governing decision

`spx/13-agent-capability-lifecycle.pdr.md` makes exact methodology identity mandatory for products carrying a tracked `spx/` tree and limits `installed` to bootstrap intent before that tree exists.

## Pending implementation

- Route the resolved methodology descriptor through product context that can distinguish a bootstrap product from one carrying tracked `spx/` product truth.
- Reject methodology readiness when a tracked `spx/` tree resolves the `installed` sentinel.
- Preserve the descriptor's side-effect-free section validation and bootstrap default for products without a tracked `spx/` tree.
- Update the co-located scenario and compliance evidence through `/apply` before treating this node as conforming to the decision.
