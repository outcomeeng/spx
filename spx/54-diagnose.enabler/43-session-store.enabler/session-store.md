# Session Store Check

PROVIDES the session-store diagnose behavior — reports the `.spx/` session store from doing sessions joined to the shared worktree pool snapshot's live claim set, retaining the orphan count as an informational reading and pairing the verdict with a safe remediation hint for both the whole-product diagnose report and the domain-owned session-store diagnostic provider
SO THAT the `spx diagnose` engine in [`spx/54-diagnose.enabler/diagnose.md`](../diagnose.md)
CAN fold session-store health into the overall environment verdict

## Assertions

### Mappings

- The check maps every successfully gathered session-store reading to consistent (bucket healthy), retaining the orphaned doing-session count as informational data, and maps gathering errors to unknown (bucket unknown); no remediation directs the operator to release a session ([test](tests/session-store.mapping.l1.test.ts))
- The session-store reading joins doing sessions to the shared worktree pool snapshot's normalized live claim set, counts orphaned doing sessions for informational reporting, and classifies every successfully derived reading as consistent (bucket healthy) ([test](tests/session-store-snapshot.mapping.l1.test.ts))
