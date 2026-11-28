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

## External values reach the terminal without control-byte escaping

This node's terminal output path passes values that originated outside the product's own source straight to the process streams. [spx/13-cli.enabler/15-cli-architecture.adr.md](spx/13-cli.enabler/15-cli-architecture.adr.md) makes escaping a property of the composed value: an externally-originated segment is escaped where it is embedded, through the `src/lib/terminal-text/` primitive, while product-authored segments keep their bytes so styling and line structure survive. This node predates that invariant and has not migrated to it.

**Unescaped sites:**

- `src/lib/precommit/deps-install-gate.ts` — the gate-failure `console.error` — a caught `git diff` subprocess error over argv-supplied refs
- `src/lib/precommit/main-checkout-gate.ts` — the gather-failure `console.error` — a caught git subprocess error
- `src/lib/precommit/install-hooks.ts` — the install-failure `console.error` — a caught filesystem error embedding hook file paths

**Impact:** a value carrying an escape byte (`0x1b`) can reposition the cursor, recolor the terminal, or clear the screen; a value carrying a line feed can forge an additional diagnostic line that reads as if spx emitted it. Whoever controls the named origins controls those bytes.

**Resolution:** compose this node's terminal-destined text through `src/lib/terminal-text/`, declaring each interpolated value authored or external at the point of composition; then add the node's own compliance assertion and co-located evidence that a control-byte-bearing value renders escaped. [`spx/54-diagnose.enabler`](spx/54-diagnose.enabler/diagnose.md) carries the migrated shape and its evidence.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.

## The hook tests observe configuration text, not the commands each hook runs

The tests of the `lefthook.yml` rows and of the rendered portable hook read text. None of them runs a hook and watches which commands it starts.

**Evidence:** The evidence audit of this Node, run 2026-11-28_02-14-36-645-7f762b8e76d8 sealed rejected at 1138da6d7, found two gaps.

- `mutation-falsifiability`: `assertLefthookConfigRoutesLifecycleHooksThroughGates` checks only substrings and command names. Each of these mutations survives every precommit test:
  - inverting `-eq 0` around `pnpm run build`, or around the post-checkout install
  - swapping the gate's 0 and 78 branches
  - dropping the `rebase` guard on `post-rewrite`
  - moving the build ahead of the gate
- `oracle-independence`: the rendered-hook rows are checked against `PORTABLE_HOOK_TOKENS`, which the production module under test owns. The rows cover the order `LEFTHOOK_BIN`, then the worktree binary, then `PATH`; and, with none reachable, the frozen install and then the worktree binary. Negating `[ -x "$worktree_lefthook" ]` survives, and so does dropping the `&&` after the frozen install.

**Impact:** A hook that rebuilds `dist/` on the wrong gate status, installs on every checkout, or never reaches the worktree's lefthook passes every test of this Node. The Node's `evidence` entry `test` reads not-run, so the Node stays `specified`.

**Settlement condition:** Each `run` script of `lefthook.yml`, and the rendered portable hook, runs under `sh` in a temporary worktree with recording stubs for `pnpm`, `tsx` and `lefthook` on `PATH`. For each gate status and each binary arrangement, the evidence observes which commands run and in what order. Each mutation above fails a test.

**Reason deferred:** The fix replaces this Node's hook evidence with process-level tests and a stub harness. That is a test rewrite of its own, larger than a Changeset that changes only the Node's refresh rule.
