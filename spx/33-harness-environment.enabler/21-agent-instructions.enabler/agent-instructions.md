# Agent Instructions

PROVIDES deterministic instruction-file reconciliation for participating coding agents
SO THAT products using spx
CAN keep `AGENTS.md` and coding-agent-native instruction files aligned with configured product guidance and exact methodology identity

## Assertions

### Compliance

- ALWAYS: instruction reconciliation preserves product-authored durable rules while applying configured generated sections deterministically ([audit])
- ALWAYS: repeated reconciliation over the same inputs produces byte-identical managed sections ([audit])
- ALWAYS: managed Spec Tree instruction markers match the exact methodology version declared by product configuration ([audit])
- NEVER: routine instruction or capability reconciliation advances managed instruction markers to a different methodology version ([audit])
- NEVER: reconcile instruction outputs for a coding agent that is not both explicitly enabled and detected as available ([audit])
- NEVER: overwrite unmanaged human-authored content without an explicit managed-section boundary ([audit])
