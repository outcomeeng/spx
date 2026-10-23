# Issues

## Holder-record mechanism stated in the PDR

**Evidence.** The PDR audit of [spx/21-infrastructure.enabler/11-host-command-lock.enabler/15-host-command-lock.pdr.md](spx/21-infrastructure.enabler/11-host-command-lock.enabler/15-host-command-lock.pdr.md) rejected content-classification (rule `architecture-content`): the rule beginning "after admission and before it spawns the command, the supervisor writes an advisory holder record" states the write ordering, the locked-descriptor write, the in-place rewrite after the spawn, and the persisted record fields (run id, supervisor process id, working directory, start time, child process group). These are implementation approach and schema that the PDR's audience, practitioners, coding agents, and CI operating through the CLI, does not operate.

**Impact.** The PDR carries mechanism that belongs to [spx/21-infrastructure.enabler/11-host-command-lock.enabler/21-kernel-held-lock.adr.md](spx/21-infrastructure.enabler/11-host-command-lock.enabler/21-kernel-held-lock.adr.md), so the PDR fails its content-classification audit row and the mechanism has two potential homes.

**Settlement condition.** The PDR states only the observable diagnostic guarantee, that a diagnosable record names an orphaned run. The ADR owns the write ordering, the in-place rewrite, and the record fields.

## The wait-cap case cannot distinguish a cap expiry after the load window: `spx/21-infrastructure.enabler/11-host-command-lock.enabler/tests/wait-cap.scenario.l1.test.ts` `never starts the command when the cap expires between a passing window and the spawn` [`spx/21-infrastructure.enabler/11-host-command-lock.enabler/15-host-command-lock.pdr.md`](spx/21-infrastructure.enabler/11-host-command-lock.enabler/15-host-command-lock.pdr.md)

In the case `never starts the command when the cap expires between a passing window and the spawn`, the scripted clock advances only on sleeps and the cap equals the window end (30 s). `capExpired()` at the top of the admission loop already ends the wait at t = 30000 ms, so the post-window `return !capExpired()` is never the deciding line. The case cannot be told apart from "cap expires during the load window".

**Impact:** the guarantee in [spx/21-infrastructure.enabler/11-host-command-lock.enabler/15-host-command-lock.pdr.md](spx/21-infrastructure.enabler/11-host-command-lock.enabler/15-host-command-lock.pdr.md) that an expired cap never starts the command is unevidenced for the interval between a passing window and the spawn: removing the post-window check leaves the case green.

**Resolution:** a case whose sample or holder-record step advances the fake clock past the cap after the window passes, asserting no spawn and status `not_ready`.

**Skills:** `/apply`, `/author-typescript-test`, `/audit-typescript-test`.

**Revisit condition:** when the node's wait-cap evidence is next changed.

## A failing post-spawn holder-record write misreports a running child as unstarted: `src/lib/host-command-lock/host-command-lock.ts` `runOutermost spawnChild` [`spx/21-infrastructure.enabler/11-host-command-lock.enabler/15-host-command-lock.pdr.md`](spx/21-infrastructure.enabler/11-host-command-lock.enabler/15-host-command-lock.pdr.md)

`spawnChild` calls `fs.writeHolderRecord` after `deps.spawn` has started the child. A throwing write (ENOSPC, EIO) leaves the spawn try-block before the exit and error listeners are registered. The supervisor then rejects, closes its descriptor copy, and `runOutermost` reports `SPAWN_FAILED` with `started:false` and exit 127, while the child runs in its own process group, holds the inherited descriptor, and keeps the slot unobserved.

**Impact:** the result line contradicts the terminal-result guarantee of [spx/21-infrastructure.enabler/11-host-command-lock.enabler/15-host-command-lock.pdr.md](spx/21-infrastructure.enabler/11-host-command-lock.enabler/15-host-command-lock.pdr.md): a started child is reported as not started, and its slot stays held without a supervisor observing it.

**Resolution:** guard the post-spawn record write so a failure leaves the child supervised and reported, or terminate the spawned group before reporting `started:false`; add a scenario for a failing post-spawn record write.

**Skills:** `/apply`, `/author-typescript-code`, `/audit-typescript-code`, `/author-typescript-test`.

**Revisit condition:** when the node's supervision code is next changed.
