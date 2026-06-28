# Issues: Precommit

## FOLLOW-UP: harden obsolete-shim recognition with a generated sentinel

`isPortableLefthookShim` recognizes a portable shim by the `call_lefthook()`
marker present in every rendered template version. A hand-written Git hook that
happens to contain that exact string would be misclassified as an spx shim and
removed by `removeObsoletePortableHooks` when its lefthook section is
de-configured. The prior exact-template comparison had no such false-positive.

Impact: negligible. The trigger requires a de-configured, hand-written hook that
reproduces spx's internal `call_lefthook()` function name; the `audit-typescript`
gate rated this collision negligible and the governing assertion accurate, and a
falsely-removed shim's invocation is an inert `lefthook run <removed-hook>` no-op.

Hardening: render a dedicated sentinel string — one no hand-written hook would
carry — into the template and recognize current and future shims by it, retaining
a structural fallback so already-installed pre-sentinel shims are still cleaned.

Reason deferred: shim-recognition precision is its own concern and this gap does
not block the marker-based cleanup the node now delivers.

Source: PR #304 review (Codex P2, `src/lib/precommit/install-hooks.ts:145`).
