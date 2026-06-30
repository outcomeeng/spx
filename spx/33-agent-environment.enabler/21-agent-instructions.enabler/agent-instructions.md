# Agent Instructions

PROVIDES deterministic instruction-file reconciliation for configured agents
SO THAT products using spx
CAN keep `AGENTS.md` and configured-agent instruction files aligned with configured product guidance

## Assertions

### Compliance

- ALWAYS: instruction reconciliation preserves product-authored durable rules while applying configured generated sections deterministically ([review])
- ALWAYS: repeated reconciliation over the same inputs produces byte-identical managed sections ([review])
- NEVER: overwrite unmanaged human-authored content without an explicit managed-section boundary ([review])
