# Session Store Check

PROVIDES the session-store diagnose behavior — classifies the `.spx/` session store from doing sessions joined to the shared worktree pool snapshot's live claim set, pairing the verdict with a remediation hint for both the whole-product diagnose report and the domain-owned session-store diagnostic provider
SO THAT the `spx diagnose` engine in [`spx/54-diagnose.enabler/diagnose.md`](../diagnose.md)
CAN fold session-store health into the overall environment verdict

## Assertions

### Mappings

- The check classifies the session store reading as consistent (the store reads and every doing session has a matching live claim; bucket healthy), orphaned-claims (at least one doing session has no matching live claim; bucket degraded), or unknown (bucket unknown) when gathering errors, pairing each verdict with a remediation hint ([test](tests/session-store.mapping.l1.test.ts))
- The session-store reading joins doing sessions to the shared worktree pool snapshot's normalized live claim set, counts orphaned doing sessions, and classifies the derived reading with the same verdict and bucket mapping ([test](tests/session-store-snapshot.mapping.l1.test.ts))
