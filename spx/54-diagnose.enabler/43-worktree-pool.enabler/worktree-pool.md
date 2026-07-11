# Worktree Pool Check

PROVIDES the worktree-pool diagnose behavior — classifies the git worktree layout and canonical-checkout branch standing from the shared worktree pool snapshot, reports how many worktrees are `running` versus `free` as information, and pairs the verdict with a remediation hint for both the whole-product diagnose report and the domain-owned worktree-pool diagnostic provider
SO THAT the `spx diagnose` engine in [`spx/54-diagnose.enabler/diagnose.md`](../diagnose.md)
CAN fold worktree-pool health into the overall environment verdict

## Assertions

### Mappings

- The check classifies the worktree layout reading as compliant (a lone working tree, or a bare-repository pool whose designated main checkout is attached to the resolved default branch; bucket healthy), non-compliant (linked worktrees attached to a non-bare repository, a missing designated main checkout, a detached designated main checkout, or a designated main checkout attached to another branch; bucket broken), or unknown (bucket unknown) when gathering, default-branch resolution, or canonical-branch observation errors, pairing each verdict with a remediation hint ([test](tests/worktree-pool.mapping.l1.test.ts))
- The shared worktree pool snapshot maps git facts, canonical-checkout designation, default-branch resolution, canonical-branch observation, and occupancy claims into the worktree layout reading fields, then classifies the derived reading with the same verdict and bucket mapping ([test](tests/worktree-pool-snapshot.mapping.l1.test.ts))

### Properties

- Adding a free worktree or dead claim to an otherwise compliant layout never degrades the verdict and only changes the reported `running` and `free` occupancy counts ([test](tests/worktree-pool-snapshot.property.l1.test.ts))
