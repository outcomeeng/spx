# Context fidelity

The protocol lives at `probes/context-fidelity/probe.md`, the target of the context-ingestion node's `[probe]` assertion. Working runs write under `runs/` inside this directory, which git ignores; every attested run retains at least one inspectable artifact beside this file.

## Intent

The operator expects `spx spec context show` and `list` to give an agent the same product truth that `/contextualize` loads for the same target. Then a session can load context through one deterministic command and need not walk `spx/` by hand. Each selection and projection assertion of this node and its children holds on generated fixture trees. Only a run on spx's own tree can show whether the command, read on a real tree with real decisions, citations, notes, and a declared migration, still matches what the skill loads. Each difference must be one an assertion declares, such as Digest in place of a full sibling spec, a path-only reference to `ISSUES.md`, or a tree-absolute citation binding where a code-span path does not. A difference no assertion declares is the misunderstanding this probe exposes.

## Environment and preconditions

- A worktree of the spx repository, checked out at the commit under verification, with its `spx.config.yaml` declaring `methodology.version: 4.0.0` and `methodology.migratingFrom: 3.2.0`.
- `pnpm install` complete in that worktree. Every command runs from the worktree root through `tsx src/cli.ts`, so the live source is under test, not the global `spx` build.
- The worktree is clean (`git status --short` prints nothing), so the tracked tree the command reads equals the committed tree.
- Git ignores the probe's `runs/` directory: `git check-ignore -q spx/31-spec-domain.enabler/43-context-ingestion.enabler/probes/context-fidelity/runs/run-1/head.txt` exits zero, so working output never dirties the tree a later step reads.
- The spec-tree plugin is installed for the coding agent that performs the `/contextualize` comparison, and the agent session has loaded `/understand`.
- `RUN` names the run directory: `spx/31-spec-domain.enabler/43-context-ingestion.enabler/probes/context-fidelity/runs/run-1` for the first run and `.../runs/run-2` for the second. Each run starts with `mkdir -p "$RUN"`.

## Protocol

The probed targets on spx's tree, each chosen for the assertions it exercises:

| Id | Target                                                                                 | Exercises                                                                                                                                                                                       |
| -- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T0 | no target                                                                              | the targetless projection: product spec in Full, node specs at depths 1 and 2 in Digest, decisions at depths 0 to 2 in Digest, and `ISSUES.md` path-only references                             |
| T1 | `spx/`                                                                                 | the explicit product-root target: product and root decisions in Full, top-level nodes in Digest, and its intended difference from T0                                                            |
| T2 | `spx/31-spec-domain.enabler/43-context-ingestion.enabler/43-target-resolution.enabler` | ancestor decisions: root decisions below index 31, `spx/31-spec-domain.enabler/43-context-ingestion.enabler/32-context-manifest-schema.adr.md` below index 43, and the target's own ADR in Full |
| T3 | `spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler`                         | cited decisions: the target ADR cites decisions inside the sibling nodes `29-filename-grammar.enabler` and `43-entry-recognition.enabler`, which the structural walk does not reach             |
| T4 | `spx/18-state.enabler/32-worktree-topology.enabler`                                    | a cited decision that is also selected structurally, `spx/15-worktree-management.pdr.md`, which appears once                                                                                    |
| T5 | T2, T3, and T4 in one call                                                             | multi-target composition: each entry appears once at its highest mode, and target order does not change output                                                                                  |

Steps 1 to 6 make up one run. Perform them for `run-1`, then again from step 1 for `run-2`.

1. Record the subject: `git rev-parse HEAD > "$RUN/head.txt"` and `git status --short > "$RUN/status.txt"`. The status file must be empty.
2. Run the targetless and product-root projections:
   - `tsx src/cli.ts spec context show > "$RUN/t0.show.txt"`
   - `tsx src/cli.ts spec context show --json > "$RUN/t0.show.json"`
   - `tsx src/cli.ts spec context show spx/ > "$RUN/t1.show.txt"`
   - `tsx src/cli.ts spec context list spx/ > "$RUN/t1.list.txt"`
   - `tsx src/cli.ts spec context list spx/ --json > "$RUN/t1.list.json"`
3. For each single target T2, T3, and T4, written as `<target>` with output prefix `<id>` (`t2`, `t3`, `t4`):
   - `tsx src/cli.ts spec context show <target> > "$RUN/<id>.show.txt"`
   - `tsx src/cli.ts spec context show <target> --json > "$RUN/<id>.show.json"`
   - `tsx src/cli.ts spec context list <target> > "$RUN/<id>.list.txt"`
   - `tsx src/cli.ts spec context list <target> --json > "$RUN/<id>.list.json"`
4. Run the multi-target call T5 in two argument orders:
   - `tsx src/cli.ts spec context show spx/31-spec-domain.enabler/43-context-ingestion.enabler/43-target-resolution.enabler spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler spx/18-state.enabler/32-worktree-topology.enabler > "$RUN/t5.show.txt"`
   - `tsx src/cli.ts spec context show spx/18-state.enabler/32-worktree-topology.enabler spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler spx/31-spec-domain.enabler/43-context-ingestion.enabler/43-target-resolution.enabler > "$RUN/t5.reversed.show.txt"`
   - `tsx src/cli.ts spec context list spx/31-spec-domain.enabler/43-context-ingestion.enabler/43-target-resolution.enabler spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler spx/18-state.enabler/32-worktree-topology.enabler --json > "$RUN/t5.list.json"`
   - `cmp "$RUN/t5.show.txt" "$RUN/t5.reversed.show.txt"` exits zero.
5. In a fresh agent session on the same worktree, after `/understand`, invoke `/contextualize spx/`, then `/contextualize` on each of T2, T3, and T4. For each one, write the manifest the skill emits to `"$RUN/<id>.contextualize.txt"`, together with every document path it read, and mark each path as read in full or listed only. T0 compares against the `spx/` invocation. T5 compares against the union of the T2, T3, and T4 invocations.
6. For each target, write `"$RUN/<id>.comparison.md"`, a table with one row per document path that appears in either the `show` output or the `/contextualize` record. Each row names the path, how `show` delivered it (Full, Digest, reference, or absent), and how `/contextualize` loaded it (read, listed, or absent). Every row where the two differ also names the selection or projection assertion of `spx/31-spec-domain.enabler/43-context-ingestion.enabler` or of one of its children that declares the difference, by full spec path and assertion text. A row that differs and names no declaring assertion is a fidelity failure. In the same file, record every case where the `show` and `list` entry sets for a target disagree, and every case where a text output and its `--json` output select different entries.
7. After both runs, compare them: `diff -r runs/run-1 runs/run-2`, run inside the probe directory, reports differences in no `*.show.*` or `*.list.*` file. The two `head.txt` files are equal.
8. Copy the retained artifacts beside this file: the `*.show.*`, `*.list.*`, `*.contextualize.txt`, and `*.comparison.md` files of `run-1`, and the step 7 diff output. Link each one from the attested run.

## Limitations

- A code-span path and a node-local or `../` link bind no citation, so the probe cannot show citations that spx's tree writes in those forms. Before #252's link-form conversion, most decision references in spx's tree use those forms. One example is the context-ingestion subtree's references to `spx/23-spec-tree.enabler/15-public-library-surface.adr.md`, `spx/23-spec-tree.enabler/21-kind-registry.adr.md`, and `spx/23-spec-tree.enabler/26-filename-grammar.adr.md`. `show` therefore omits decisions that `/contextualize` reads by scanning for full paths. Until the conversion turns those references into tree-absolute links, T3 and T4 cannot show citation binding on the real tree, and each such row in a comparison is an undeclared difference that a run records.
- The probe runs on spx's own tree only. A product that declares methodology `3.2` alone, `4.0` alone, or a 4.0-shaped tree is not probed, so the 4.0 node kinds, `{slug}.spec.md` node specs, and the node-local citation form are not exercised.
- `/contextualize` reports its read-set as agent-written prose, so step 5 depends on the agent recording that read-set completely. The comparison checks document selection and mode only. It does not check whether the agent used what it read.
- `--methodology` and `--coding-agent` are not exercised, because `/contextualize` loads no methodology foundation to compare against.
