# Session Store Check

PROVIDES the session-store diagnose behavior — classifies the `.spx/` session store from doing sessions joined to the shared worktree pool snapshot's live claim set, pairing the verdict with a remediation hint for both the whole-product diagnose report and the focused session-store diagnosis
SO THAT the `spx diagnose` engine in [`spx/54-diagnose.enabler/diagnose.md`](../diagnose.md)
CAN fold session-store health into the overall environment verdict

## Assertions

### Mappings

- The check classifies the session store as consistent (the store reads and every doing session has a matching live claim in the shared worktree pool snapshot; bucket healthy) or orphaned-claims (a doing session whose backing worktree claim is absent or not live; bucket degraded) from doing sessions joined to the snapshot's normalized live claim set, and as unknown (bucket unknown) when gathering errors, pairing each verdict with a remediation hint ([test](tests/session-store.mapping.l1.test.ts), [test](tests/session-store-snapshot.mapping.l1.test.ts))
