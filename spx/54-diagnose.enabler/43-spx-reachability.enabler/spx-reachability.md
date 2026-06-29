# Spx Reachability Check

PROVIDES the spx-reachability diagnose behavior — classifies the `spx` CLI against the resolved version floor from its PATH resolution and reported version, pairing the verdict with a remediation hint for both the whole-product diagnose report and the domain-owned spx-reachability diagnostic provider
SO THAT the `spx diagnose` engine in [`spx/54-diagnose.enabler/diagnose.md`](../diagnose.md)
CAN fold spx tool health into the overall environment verdict

## Assertions

### Mappings

- The check classifies spx as reachable (resolved on PATH at or above the floor; bucket healthy), below-floor (resolved but below the floor; bucket degraded), or unreachable (absent from PATH; bucket broken) from the PATH resolution and reported version, pairing each verdict with a remediation hint ([test](tests/reachability.mapping.l1.test.ts))
- When no floor is resolved, the check judges presence alone — a resolved spx classifies as present (bucket healthy), reporting its path and version with no floor comparison, while an absent spx remains unreachable (bucket broken) regardless of the floor ([test](tests/reachability.mapping.l1.test.ts))
- An errored probe reading classifies spx as unknown (bucket unknown) regardless of the resolved floor, since presence cannot be inferred from a failed probe — pairing the verdict with a remediation hint ([test](tests/reachability.mapping.l1.test.ts))
- A resolved spx whose version cannot be compared to a present floor — the reported version is absent or not semver-shaped — classifies as unknown (bucket unknown), pairing the verdict with a remediation hint ([test](tests/reachability.mapping.l1.test.ts))

### Properties

- A reachable or below-floor verdict reports the resolved spx path and version verbatim in the check's readings ([test](tests/reachability-readings.property.l1.test.ts))
