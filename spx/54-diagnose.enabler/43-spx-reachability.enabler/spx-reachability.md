# Spx Reachability Check

PROVIDES the spx-reachability diagnose check — classifies the `spx` CLI against the manifest's version floor from its PATH resolution and reported version, pairing the verdict with a remediation hint
SO THAT the `spx diagnose` engine in [`spx/54-diagnose.enabler/diagnose.md`](../diagnose.md)
CAN fold spx tool health into the overall environment verdict

## Assertions

### Mappings

- The check classifies spx as reachable (resolved on PATH at or above the manifest floor; bucket healthy), below-floor (resolved but below the floor; bucket degraded), or unreachable (absent from PATH; bucket broken) from the PATH resolution and reported version, and as unknown (bucket unknown) when the reading cannot be compared to the floor — the probe errors, the manifest carries no floor, or the reported version is absent or not semver-shaped — pairing each verdict with a remediation hint ([test](tests/reachability.mapping.l1.test.ts))

### Scenarios

- A reachable or below-floor verdict reports the resolved spx path and version verbatim in the check's readings ([test](tests/reachability-readings.scenario.l1.test.ts))
