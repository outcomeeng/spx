# Methodology Context

PROVIDES the `methodology-context` diagnose check over the product's declared methodology selection and the methodology trees spx ships to serve it
SO THAT `spx diagnose`
CAN report whether the methodology the product declares is configured, shipped, and matched by its provider, and whether a migration window is open

## Assertions

- The check reports the declared `methodology.version` and `methodology.migratingFrom`, whether spx ships a `methodology/{MAJOR.MINOR}/` tree for the declared line and each enabled coding agent, and — where the shipped tree's `source.json` records `provides` and `supports` — whether the declaration matches them per `spx/13-agent-capability-lifecycle.pdr.md`, reporting the match as undeclared when the record carries neither
- The probe reads spx's package root and the product's resolved configuration, and no path under a coding agent's home or under the product's working tree beyond its configuration
- Given top-level methodology config declares a version and spx ships a tree for that version's line and each enabled coding agent, when `spx diagnose --format json` runs, then the `methodology-context` check reports the declared selection with a healthy verdict
- Given top-level methodology config declares `migratingFrom`, when `spx diagnose --format json` runs, then the `methodology-context` check reports the open migration window alongside the target version
- Given spx ships no tree for the declared methodology line and an enabled coding agent, when `spx diagnose --format json` runs, then the `methodology-context` check reports an unavailable verdict naming the missing tree and the lines spx ships
- Given a diagnose manifest carries methodology facts, when `spx diagnose --manifest <path> --format json` runs, then the `methodology-context` check reports against the manifest methodology facts
- Given methodology observation errors, when `spx diagnose --format json` runs, then the `methodology-context` check reports an unknown verdict
- ALWAYS: the text diagnose report renders a concise methodology-context line from the same check record as JSON output
- ALWAYS: manifest-driven diagnose runs selecting `methodology-context` without methodology facts are rejected before checks run
- NEVER: the check reads a coding agent's plugin cache directory, an installed plugin location, or a user-scope directory, per `spx/25-outcomeeng.enabler/31-methodology-plugin.enabler`
- NEVER: the check compares the declared methodology version against a plugin version or derives one from the other
- NEVER: the methodology-context classifier reads files, environment variables, processes, or plugin surfaces directly; observations enter through an injected probe
