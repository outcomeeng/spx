# Methodology Context

PROVIDES the `methodology-context` diagnose check over the product's declared methodology selection and the methodology trees spx ships to serve it
SO THAT `spx diagnose`
CAN report whether the methodology the product declares is configured, shipped, and matched by its provider, and whether a migration window is open

## Assertions

### Scenarios

- Given top-level methodology config declares a version and spx ships a tree for that version's line and each enabled coding agent, when `spx diagnose --format json` runs, then the `methodology-context` check reports the declared selection with a healthy verdict ([test](tests/methodology-context.scenario.l1.test.ts))
- Given top-level methodology config declares `migratingFrom`, when `spx diagnose --format json` runs, then the `methodology-context` check reports the open migration window alongside the target version ([test](tests/methodology-context.scenario.l1.test.ts))
- Given spx ships no tree for the declared methodology line, or ships one for only some of the enabled coding agents, when `spx diagnose --format json` runs, then the `methodology-context` check reports an unavailable verdict naming the shipped lines and the shipped coding agents ([test](tests/methodology-context.scenario.l1.test.ts))
- Given a diagnose manifest carries methodology facts, when `spx diagnose --manifest <path> --format json` runs, then the `methodology-context` check reports against the manifest methodology facts ([test](tests/methodology-context.scenario.l1.test.ts))
- Given methodology observation errors, when `spx diagnose --format json` runs, then the `methodology-context` check reports an unknown verdict ([test](tests/methodology-context.scenario.l1.test.ts))

### Compliance

- ALWAYS: the check reports the declared `methodology.version` and `methodology.migratingFrom`, whether spx ships a `methodology/{MAJOR.MINOR}/` tree for the declared line and each enabled coding agent, and — where the shipped tree's `source.json` records `provides` and `supports` — whether the declaration matches them per `spx/13-agent-capability-lifecycle.pdr.md`, reporting the match as undeclared when the record carries neither ([test](tests/methodology-context.compliance.l1.test.ts))
- ALWAYS: the probe reads spx's package root and the product's resolved configuration — the enabled coding agents come from the product's harness-environment config — and no path under a coding agent's home or under the product's working tree beyond its configuration ([test](tests/methodology-context.compliance.l1.test.ts))
- ALWAYS: the text diagnose report renders a concise methodology-context line from the same check record as JSON output, for every verdict ([test](tests/methodology-context.compliance.l1.test.ts))
- ALWAYS: manifest-driven diagnose runs selecting `methodology-context` without methodology facts are rejected before checks run ([test](tests/methodology-context.compliance.l1.test.ts))
- ALWAYS: a product config still carrying `harnessEnvironment.methodology` is rejected before the probe runs, an unrelated `harnessEnvironment` defect leaves the check unaffected, and a configured check this build does not provide is rejected ahead of that legacy rejection ([test](tests/methodology-context.compliance.l1.test.ts))
- NEVER: the check reads a coding agent's plugin cache directory, an installed plugin location, or a user-scope directory, per `spx/25-outcomeeng.enabler/31-methodology-plugin.enabler` ([test](tests/methodology-context.compliance.l1.test.ts))
- NEVER: the check compares the declared methodology version against a plugin version or derives one from the other ([test](tests/methodology-context.compliance.l1.test.ts))
- NEVER: the methodology-context classifier reads files, environment variables, processes, or plugin surfaces directly; observations enter through an injected probe ([audit])
