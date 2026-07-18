# Session Store Check

PROVIDES the session-store diagnose behavior — reports the informational count of doing sessions without a matching live worktree claim, classifies every successful `.spx/` session-store gather as healthy, and pairs gather errors with an unknown verdict and safe remediation for both the whole-product diagnose report and the domain-owned session-store diagnostic provider
SO THAT the `spx diagnose` engine in [`spx/54-diagnose.enabler/diagnose.md`](../diagnose.md)
CAN fold session-store health into the overall environment verdict

## Assertions

### Mappings

- For every session-store reading, a successful gather is consistent (bucket healthy) regardless of its orphaned doing-session count, a gathering error is unknown (bucket unknown), and no remediation recommends releasing a session ([test](tests/session-store.mapping.l1.test.ts))
- The session-store reading joins doing sessions to the shared worktree pool snapshot's normalized live claim set, preserves the count of doing sessions without a matching claim as informational output, and classifies every non-errored derived reading as consistent (bucket healthy) regardless of that count ([test](tests/session-store-snapshot.mapping.l1.test.ts))
