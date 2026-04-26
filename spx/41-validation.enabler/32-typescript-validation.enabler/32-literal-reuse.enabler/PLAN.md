# Plan

The `--allowlist-existing` adoption helper authored in [literal-reuse.md](literal-reuse.md) is substantial enough to warrant its own subtree node. The two scenarios + three compliance rules added on this node, plus the clause appended to the PROVIDES line, belong on a child enabler that owns the helper as a distinct concern from the detector itself.

## Steps

1. **Write the ADR.** Author a `NN-allowlist-write-back.adr.md` governing the helper's write-back: which `spx.config.*` is written (the same one resolveConfig reads; the ambiguity error path), how the original format is preserved on write, atomicity (temp file + rename), behavior when no config file exists at the project root, idempotence guarantee, and exit-code semantics (0 after a clean write versus non-zero notice forcing re-run). Compliance section codifies DI for the FS write per `/standardizing-typescript-architecture`.

2. **Create the child enabler node.** Decide name and sparse index. Current shape suggests `21-allowlist-existing.enabler/` (slug matches the CLI flag). Spec opening: `PROVIDES the bulk-silence adoption helper SO THAT projects with pre-existing literal-reuse findings CAN adopt the literal stage without first remediating every duplication`. ADR from step 1 lives inside this directory.

3. **Move the assertions from parent to child.** Cut from [literal-reuse.md](literal-reuse.md), paste into the new child's spec (with link paths adjusted):
   - Scenarios: `--allowlist-existing` happy path + multi-config ambiguity
   - Compliance: write-only-to-include, idempotence, append-only-no-reorder
   - The PROVIDES clause `— and an adoption helper that records every current finding's value into the project's literal.allowlist.include in one operation`
   - The SO THAT extension `, plus projects adopting the literal stage that already carry pre-existing duplications,`
   - The CAN extension `— without first having to fix every pre-existing violation before the stage produces signal`
     Restore the parent PROVIDES/SO THAT/CAN to their pre-handoff wording so the parent describes the detector only.

4. **Test the child.** Author scenario + compliance tests in the child's `tests/` directory for the assertions moved in step 3.

5. **Implement.** Add `--allowlist-existing` to `LiteralCommandOptions` and to the CLI surface in `src/domains/validation/index.ts`. Read current findings, compute union with existing `literal.allowlist.include`, deduplicate, sort, write back via the format `resolveConfig` detected. Atomic write through temp file + rename.

6. **Run once against this project.** `spx validation literal --allowlist-existing`. Verify `pnpm run validate` passes against the populated allowlist.

7. **Commit separately.** Implementation commit and dogfooded-allowlist commit are distinct so the review trail shows mechanism added vs. project consumption.

8. **Track the debt.** The populated `include` list is the canonical TODO for the literal-reuse debt — each entry is either source-owned (import from src per [21-typescript-conventions.adr.md](../21-typescript-conventions.adr.md)) or test-canonical (extract to shared test support). Reduction happens entry-by-entry over time.
