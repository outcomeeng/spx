# Context fidelity

The protocol lives at `probes/context-fidelity/probe.md`, the target of the context-ingestion node's `[probe]` assertion. Working runs write under `runs/` inside this directory, which git ignores; every attested run retains at least one inspectable artifact beside this file.

## Intent

The operator expects `spx spec context show` and `list` to give an agent the product truth that context loading defines for a target, so a session loads context through one deterministic command and need not walk `spx/` by hand. Each selection and projection assertion of this node and its children holds on generated fixture trees; only a run on spx's own tree, with real decisions, citations, notes, and a declared migration, shows whether the command delivers that product truth. The comparator is therefore a read set computed for each target independently of `show`: the read set `versions/4.0/methodology/product-tree/operationalization/context-loading.md` defines, under the operator's settlements over that chapter:

- the product spec, every ancestor spec, and the explicit target's spec, in Full;
- at each ancestor level, only the decisions at a lower index than the child the path continues through, in Full, and every decision the explicit target directly contains, in Full;
- siblings along the path and the explicit target's immediate children, by their published contract, the Digest opening;
- every decision a selected document's complete source cites in the settled binding form — a Markdown inline link whose href is the decision's full path from `spx/` — resolved transitively, once, in Full;
- the explicit target's outcome record in Full;
- every `ISSUES.md` on the path, and the target's knowledge index, by path only;
- harness guides (`CLAUDE.md`, `AGENTS.md`), `spx/local/` overlays, `PLAN.md`, and evidence under `tests/`, `evals/`, and `probes/`, outside.

Any difference between that read set and the entries and projection modes `show` and `list` deliver fails the probe. Two runs at one commit produce identical output.

The probe also records what `/contextualize` from spec-tree plugin 0.100.1 loads for each target. Each place where `/contextualize` departs from the read set is recorded as a plugins defect for outcomeeng/changes#297, never as a `show` or `list` failure.

## Environment and preconditions

- A worktree of the spx repository, checked out at the commit under verification, with its `spx.config.yaml` declaring `methodology.version: 4.0.0` and `methodology.migratingFrom: 3.2.0`.
- `pnpm install` complete in that worktree. Every command runs from the worktree root through `tsx src/cli.ts`, so the live source is under test, not the global `spx` build.
- The worktree is clean (`git status --short` prints nothing), so the tracked tree the command reads equals the committed tree.
- Git ignores the probe's `runs/` directory: `git check-ignore -q spx/31-spec-domain.enabler/43-context-ingestion.enabler/probes/context-fidelity/runs/run-1/head.txt` exits zero, so working output never dirties the tree a later step reads.
- Spec-tree plugin 0.100.1 is installed for the coding agent that records the `/contextualize` read-set, and that agent session has loaded `/understand`.
- Harness guides and `spx/local/` overlays lie outside `show`, `list`, and the comparison: a row for such a file records the boundary and decides nothing.
- `RUN` names the run directory: `spx/31-spec-domain.enabler/43-context-ingestion.enabler/probes/context-fidelity/runs/run-1` for the first run and `.../runs/run-2` for the second. Each run starts with `mkdir -p "$RUN"`.

## Protocol

The probed targets on spx's tree, each chosen for the assertions it exercises:

| Id | Target                                                                                 | Exercises                                                                                                                                                                                                                                                                   |
| -- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T0 | no target                                                                              | the targetless projection: product spec in Full, node specs at depths 1 and 2 in Digest, decisions at depths 0 to 2 in Digest, and `ISSUES.md` path-only references                                                                                                         |
| T1 | `spx/`                                                                                 | the explicit product-root target: product and root decisions in Full, top-level nodes in Digest, and its intended difference from T0                                                                                                                                        |
| T2 | `spx/31-spec-domain.enabler/43-context-ingestion.enabler/43-target-resolution.enabler` | ancestor decisions: root decisions below index 31, `spx/31-spec-domain.enabler/43-context-ingestion.enabler/32-context-manifest-schema.pdr.md` below index 43, and the target's own ADR in Full                                                                             |
| T3 | `spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler`                         | ancestor decisions below the root: `spx/23-spec-tree.enabler/15-public-library-surface.adr.md`, `21-kind-registry.adr.md`, and `26-filename-grammar.adr.md` below index 48 in Full, the target's own ADR in Full, and the target's `PLAN.md` outside both `show` and `list` |
| T4 | `spx/18-state.enabler/32-worktree-topology.enabler`                                    | root decisions below index 18, among them `spx/15-worktree-management.pdr.md`, and `spx/18-state.enabler/11-state.pdr.md` below index 32, in Full, with the target's own ADR in Full                                                                                        |
| T5 | T2, T3, and T4 in one call                                                             | multi-target composition: each entry appears once at its highest mode, such as `spx/23-spec-tree.enabler/spec-tree.md` in Full as T3's ancestor and in Digest as a sibling on the T2 and T4 paths, and target order does not change output                                  |

Steps 1 to 7 make up one run. Perform them for `run-1`, then again from step 1 for `run-2`.

1. Record the subject: `git rev-parse HEAD > "$RUN/head.txt"` and `git status --short > "$RUN/status.txt"`. The status file must be empty.
2. Before running any `show` or `list` command of this run, write `"$RUN/<id>.readset.md"` for each target T0 to T5: one row per path the read set of the Intent selects, with its mode (Full, Digest, or reference), derived from `git ls-files spx` and the tracked documents' source alone. T0, the targetless projection, takes the read set the targetless rule of `spx/31-spec-domain.enabler/43-context-ingestion.enabler/54-read-set-projection.enabler/read-set-projection.md` declares: the product spec in Full, node specs at depths 1 and 2 and decisions at depths 0 to 2 in Digest, and `ISSUES.md` at those depths by path. T5 takes the union of the T2, T3, and T4 read sets, each path at the highest mode any of them selects.
3. Run the targetless and product-root projections:
   - `tsx src/cli.ts spec context show > "$RUN/t0.show.txt"`
   - `tsx src/cli.ts spec context show --json > "$RUN/t0.show.json"`
   - `tsx src/cli.ts spec context show spx/ > "$RUN/t1.show.txt"`
   - `tsx src/cli.ts spec context list spx/ > "$RUN/t1.list.txt"`
   - `tsx src/cli.ts spec context list spx/ --json > "$RUN/t1.list.json"`
4. For each single target T2, T3, and T4, written as `<target>` with output prefix `<id>` (`t2`, `t3`, `t4`):
   - `tsx src/cli.ts spec context show <target> > "$RUN/<id>.show.txt"`
   - `tsx src/cli.ts spec context show <target> --json > "$RUN/<id>.show.json"`
   - `tsx src/cli.ts spec context list <target> > "$RUN/<id>.list.txt"`
   - `tsx src/cli.ts spec context list <target> --json > "$RUN/<id>.list.json"`
5. Run the multi-target call T5 in two argument orders:
   - `tsx src/cli.ts spec context show spx/31-spec-domain.enabler/43-context-ingestion.enabler/43-target-resolution.enabler spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler spx/18-state.enabler/32-worktree-topology.enabler > "$RUN/t5.show.txt"`
   - `tsx src/cli.ts spec context show spx/18-state.enabler/32-worktree-topology.enabler spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler spx/31-spec-domain.enabler/43-context-ingestion.enabler/43-target-resolution.enabler > "$RUN/t5.reversed.show.txt"`
   - `tsx src/cli.ts spec context list spx/31-spec-domain.enabler/43-context-ingestion.enabler/43-target-resolution.enabler spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler spx/18-state.enabler/32-worktree-topology.enabler --json > "$RUN/t5.list.json"`
   - `cmp "$RUN/t5.show.txt" "$RUN/t5.reversed.show.txt"` exits zero.
6. In a fresh agent session on the same worktree, after `/understand`, invoke `/contextualize spx/`, then `/contextualize` on each of T2, T3, and T4. For each one, write the manifest the skill emits to `"$RUN/<id>.contextualize.txt"`, together with every document path it read, and mark each path as read in full or listed only. T0 and T1 record against the `spx/` invocation; T5 records against the union of the T2, T3, and T4 invocations.
7. For each target, write `"$RUN/<id>.comparison.md"`, a table with one row per path that appears in the read set, the `show` output, the `list` output, or the `/contextualize` record. Each row names the path, its read-set mode, how `show` delivered it (Full, Digest, reference, or absent), the selection reason and projection mode `list` recorded for it, and how `/contextualize` loaded it (read, listed, or absent). A row where `show` or `list` differs from the read set is a fidelity failure. A row where only `/contextualize` differs from the read set is recorded as a plugins defect for outcomeeng/changes#297. In the same file, record every case where a text output and its `--json` output select different entries; each is a fidelity failure.
8. After both runs, compare them: `diff -r runs/run-1 runs/run-2`, run inside the probe directory, reports differences in no `*.show.*` or `*.list.*` file, and the two `head.txt` files are equal. Any such difference fails the two-run assertion.
9. Copy the retained artifacts beside this file: the `*.readset.md`, `*.show.*`, `*.list.*`, `*.contextualize.txt`, and `*.comparison.md` files of `run-1`, and the step 8 diff output. Link each one from the attested run.

## Limitations

- The read set binds a citation only in the settled form, a Markdown inline link whose href is the cited decision's full path from `spx/`. A decision that spx's tree names only in a bare or code-span path stays outside the read set, while `/contextualize` reads it because its scan matches any full path; each such row is a `/contextualize` departure. On spx's tree these include `spx/13-cli.enabler/15-cli-architecture.adr.md` and `spx/19-language-registration.adr.md`, named in code spans by the root `spx/14-cli-composition.adr.md`, and `spx/16-config.enabler/21-config-file-formats.adr.md`, `spx/16-config.enabler/21-descriptor-registration.adr.md`, `spx/17-language-detection.enabler/21-detection-approach.adr.md`, `spx/22-test-environment.enabler/21-callback-scoped-environment.adr.md`, and `spx/23-spec-tree.enabler/21-kind-registry.adr.md`, named in code spans by sibling specs.
- While spx's tree names its decisions in code spans, no target exercises transitive citation binding, the canonical order of cited decisions outside the structural walk, or a cited decision the structural walk also selects appearing once. Those assertions of `spx/31-spec-domain.enabler/43-context-ingestion.enabler/65-citation-provenance.enabler/citation-provenance.md` hold on generated fixture trees; spx's tree exercises them once its decision references take the tree-absolute link form.
- The probe runs on spx's own tree only. A product that declares methodology `3.2` alone, `4.0` alone, or a 4.0-shaped tree is not probed, so the 4.0 node kinds, `{slug}.spec.md` node specs, and the node-local citation form are not exercised.
- The read set is derived by the Author from the tracked tree, and `/contextualize` reports its read-set as agent-written prose, so steps 2 and 6 depend on each record being complete. The comparison checks document selection and mode only. It does not check whether the agent used what it read.
- `--methodology` and `--coding-agent` are not exercised, because the read set carries no methodology foundation to compare against.
