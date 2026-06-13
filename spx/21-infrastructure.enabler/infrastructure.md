# Infrastructure

PROVIDES global product machinery shared across command domains, quality gates, release paths, worktree operations, and local agent workflows
SO THAT product domains that need operational substrate
CAN reuse governed hooks, harnesses, workflow boundaries, and machine-owned tooling without each re-deriving global behavior

## Assertions

### Compliance

- ALWAYS: global machinery that serves multiple product domains is governed under infrastructure rather than under the first domain that happens to consume it ([audit])
- ALWAYS: domain-specific harness, generator, and fixture specifications stay with the domain whose behavior they verify, even when their implementation modules live in a shared test-infrastructure package ([audit])
- NEVER: organize spec nodes by implementation package layout alone; spec placement follows product concern ownership, dependency order, and verification scope ([audit])
