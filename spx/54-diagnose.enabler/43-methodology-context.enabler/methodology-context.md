---
tier: prototype
---

# Methodology Context

PROVIDES the `methodology-context` diagnose check over the product's declared methodology selection and the committed methodology trees that serve it
SO THAT `spx diagnose`
CAN report whether the methodology the product declares is configured, materialized, or unavailable, and whether a migration window is open

## Assertions

### Scenarios

- Given top-level methodology config declares a version and a committed tree exists for that version and each enabled coding agent, when `spx diagnose --format json` runs, then the `methodology-context` check reports the declared selection with a healthy verdict
- Given top-level methodology config declares `migratingFrom`, when `spx diagnose --format json` runs, then the `methodology-context` check reports the open migration window alongside the target version
- Given no committed tree exists for the declared methodology version and an enabled coding agent, when `spx diagnose --format json` runs, then the `methodology-context` check reports an unavailable verdict naming the missing tree
- Given a diagnose manifest carries methodology facts, when `spx diagnose --manifest <path> --format json` runs, then the `methodology-context` check reports against the manifest methodology facts
- Given methodology observation errors, when `spx diagnose --format json` runs, then the `methodology-context` check reports an unknown verdict

### Compliance

- ALWAYS: the text diagnose report renders a concise methodology-context line from the same check record as JSON output
- ALWAYS: manifest-driven diagnose runs selecting `methodology-context` without methodology facts are rejected before checks run
- ALWAYS: the check observes committed methodology trees under the product directory, addressed by declared methodology version and coding agent.
- NEVER: the check reads a coding agent's plugin cache directory, an installed plugin location, or any path outside the product directory, per `spx/25-outcomeeng.enabler/31-methodology-plugin.enabler`.
- NEVER: the check compares the declared methodology version against a plugin version or derives one from the other.
- NEVER: the methodology-context classifier reads files, environment variables, processes, or plugin surfaces directly; observations enter through an injected probe
