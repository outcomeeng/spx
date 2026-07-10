# Plan: Testing provider role in spec-tree materialization

> **Reconcile against `spx/PLAN.md` first.** The corrected model separates
> `persistence` (records, journals, and snapshots) from `backend` (formerly
> "materialization") and `delivery`, makes verification the five types,
> requires additive migration, and defers `.surface`.

## Harness vocabulary guard

Before applying this plan to agent-facing test output, transcript handling, or
verification-loop guidance, read `spx/12-agent-harness.pdr.md` and use its
vocabulary as the authority: agent harness, agent, agent adapter, and agent
session. Keep the `--agent` output mode distinct from agents, agent adapters,
and agent sessions.

## Ownership target

`spx/41-test.enabler` owns test execution and language-registered input
discovery:

- test file discovery
- runner adapter selection
- language descriptor dispatch
- product-input discovery for test freshness
- last-run evidence recording
- stale/fresh comparison inputs for test evidence

It does not own spec-tree state semantics or interface rendering.

## Contract needed by spec-tree materialization

The spec-tree materialization layer needs a testing provider contract that can
answer:

- which test paths cover a node
- which product input paths affect those test paths
- whether current recorded evidence is usable
- how to request fresh verification
- which operations are unsupported for a backend or language

## Language descriptor responsibilities

Language descriptors should own language-specific product-input expansion.

Examples:

- TypeScript expands `.test.ts` paths through configured runner inputs,
  package inputs, `tsconfig`, and local import closure.
- Rust expands Rust test paths through Cargo manifests, lockfiles, target
  metadata, and reachable crate source paths.
- A descriptor that cannot compute inputs reports that limitation so status can
  render stale or unsupported rather than falsely fresh.

## Next steps

1. Amend testing ADRs only after the spec-tree materialization contract exists.
2. Define a provider interface for discovered test paths and product input paths.
3. Reuse existing last-run staleness input machinery where it fits.
4. Add fake-descriptor tests before wiring TypeScript-specific expansion.

## Future slices

### CI environment

Define and implement the CI event/output contract for:

```bash
spx test passing --ci
```

Choose the exact structured event schema before implementation. CI should be
able to annotate checks without parsing native runner text.

### Product dogfooding

Route the package and CI test gates through `spx test` when the CI output
contract can replace raw runner invocation without losing diagnostics.

## Open design questions

- Whether runner adapter selection belongs in the existing testing descriptor
  section or a new runner-specific descriptor section.
- Whether the initial allow-list should include only current product adapters
  (`vitest`, `pytest`) or reserve names for near-term adapters (`jest`,
  `node-test`, `playwright`).
- The exact CI event schema and whether it should be JSONL, a hosted-check
  summary plus JSON artifact, or both.
- Whether unsupported custom runners should fail closed or use a generic
  shell-command adapter with reduced guarantees.
