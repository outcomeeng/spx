# Marketplace Install Check

PROVIDES the marketplace-install diagnose behavior — classifies the methodology marketplace's install state across the Claude and Codex plugin surfaces, expected-against-installed, pairing the verdict with a remediation hint for both the whole-product diagnose report and the domain-owned marketplace-install diagnostic provider
SO THAT the `spx diagnose` engine in [`spx/54-diagnose.enabler/diagnose.md`](../diagnose.md)
CAN fold marketplace-install health into the overall environment verdict

## Assertions

### Mappings

- The check classifies the marketplace install state as installed (each present plugin surface has the marketplace registered and every expected plugin installed and enabled; bucket healthy), drifted (registered, but an expected plugin is missing or installed but disabled; bucket degraded), unregistered (a present plugin surface lacks the marketplace registration; bucket broken), plugin-cli-unavailable (marketplace facts are configured but neither plugin CLI is available; bucket degraded), not-applicable (marketplace facts are not configured; bucket not-applicable), or unknown (a command errors; bucket unknown), pairing each verdict with a remediation hint ([test](tests/marketplace-install.mapping.l1.test.ts))
