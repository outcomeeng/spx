# Marketplace Install Check

PROVIDES the marketplace-install diagnose check — classifies the methodology marketplace's install state across the Claude and Codex plugin surfaces, expected-against-installed, pairing the verdict with a remediation hint
SO THAT the `spx diagnose` engine in [`spx/54-diagnose.enabler/diagnose.md`](../diagnose.md)
CAN fold marketplace-install health into the overall environment verdict

## Assertions

### Mappings

- The check classifies the marketplace install state as installed (each present plugin surface has the marketplace registered and every expected plugin installed and enabled; bucket healthy), drifted (registered, but an expected plugin is missing or installed but disabled; bucket degraded), or unregistered (a present plugin surface lacks the marketplace registration; bucket broken) from each surface's plugin CLI joined expected-against-installed; as not-applicable (bucket not-applicable) when neither surface exposes a plugin CLI; and as unknown (bucket unknown) when a command errors, pairing each verdict with a remediation hint ([test](tests/marketplace-install.mapping.l1.test.ts))
