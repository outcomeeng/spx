# Plan: methodology-context diagnosis

## Governing decision

`spx/13-agent-capability-lifecycle.pdr.md` limits the `installed` methodology version to bootstrap intent before a tracked `spx/` tree exists and requires exact methodology identity once product truth is present.

## Pending implementation

- Add tracked-`spx/` presence to the injected methodology-context observation without moving filesystem access into the classifier.
- Classify `installed` as healthy bootstrap intent only when no tracked `spx/` tree exists.
- Classify `installed` as degraded hidden methodology identity when a tracked `spx/` tree exists, with exact-version remediation.
- Preserve installed-version observation for diagnostics without converting the sentinel into configured exact identity.
- Update the co-located scenario and compliance evidence through `/apply` before treating this node as conforming to the decision.
