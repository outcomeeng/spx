# Issues

## Holder-record mechanism stated in the PDR

**Evidence.** The PDR audit of [spx/21-infrastructure.enabler/11-host-command-lock.enabler/15-host-command-lock.pdr.md](spx/21-infrastructure.enabler/11-host-command-lock.enabler/15-host-command-lock.pdr.md) rejected content-classification (rule `architecture-content`): the rule beginning "after admission and before it spawns the command, the supervisor writes an advisory holder record" states the write ordering, the locked-descriptor write, the in-place rewrite after the spawn, and the persisted record fields (run id, supervisor process id, working directory, start time, child process group). These are implementation approach and schema that the PDR's audience, practitioners, coding agents, and CI operating through the CLI, does not operate.

**Impact.** The PDR carries mechanism that belongs to [spx/21-infrastructure.enabler/11-host-command-lock.enabler/21-kernel-held-lock.adr.md](spx/21-infrastructure.enabler/11-host-command-lock.enabler/21-kernel-held-lock.adr.md), so the PDR fails its content-classification audit row and the mechanism has two potential homes.

**Settlement condition.** The PDR states only the observable diagnostic guarantee, that a diagnosable record names an orphaned run. The ADR owns the write ordering, the in-place rewrite, and the record fields.
