<overview>

The status claim `spx.status.json` every output node carries, the results and pins it records, how the projector derives state from it, and how a passing-scope list a toolchain that has not adopted the claim still reads relates to it. Read it when interpreting a node's state, when a claim conflicts, or when a gate reads verification results.

</overview>

<status_claim>

The projector is the claim's only writer; operators and agents author specs, verification artifacts, and implementation, never state. The claim records the node's own `state`, the `malleability` the measurement ran against, and `verification` results grouped by type. Test, eval, and probe entries key by the node-relative path their tag links; audit entries key by rule slug; a variant's copies of its parent's entries key by the parent artifact's tree-absolute path.

```json
{
  "state": "passing",
  "malleability": "spec",
  "verification": {
    "test": {
      "tests/parsing.scenario.l1.test.ts": {
        "verdict": "passed",
        "commit": "8f7a3b1c2d4e5f60718293a4b5c6d7e8f9012345",
        "read": ["spx/55-example.domain/example.spec.md", "spx/55-example.domain/tests/parsing.scenario.l1.test.ts", "src/pool/parser.ts"]
      }
    },
    "audit": {
      "claim-liveness": {
        "verdict": "passed",
        "actor": { "kind": "agent", "id": "audit-agent" },
        "run": "01890a5d-ac96-774b-bcce-b302099a8057",
        "commit": "8f7a3b1c2d4e5f60718293a4b5c6d7e8f9012345",
        "read": ["spx/55-example.domain/example.spec.md", "spx/55-example.domain/15-ownership.adr.md", "src/pool/claim.ts"]
      }
    }
  }
}
```

Every entry carries `passed`, `failed`, or `not-run`. A `passed` or `failed` entry carries a pin — a commit and the read paths naming the declaration, the artifact, and the subject; a probe pin names the declaration, the probe's directory, and the implementation files the run observed. An Agentic or Attested result also carries the actor (`person` or `agent` with a product-defined id) and a run id. A `not-run` entry carries no pin. Git compares the pinned commit with the current tree over the read paths; a non-empty difference invalidates the result. A conflicted claim is regenerated, never merged by hand. The claim never copies dependency status; effective malleability and effective state are derived on read.

</status_claim>

<state_derivation>

| State     | Condition                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| Declared  | The spec exists, and verification artifacts required by its malleability are missing                            |
| Specified | Required artifacts exist, without a current passing result for the malleability                                 |
| Passing   | Validate passes for the changeset, and every required node-local result is current and passes                   |
| Failing   | A required result becomes invalid or stops passing after the node reached Passing, under unchanged declarations |

An initial failed or unrun result leaves Specified; Failing records a regression. Deleting the artifact behind a passing result makes the node Failing, never Declared. A changed decision or spec invalidates every affected pin and derives the state anew. Validate produces no node-local result; its failure blocks projection and merge. A `.product` carries no claim; a variant's claim carries its parent's results under its own selection, and the parent is Passing only when every variant passes.

</state_derivation>

<passing_scope_list>

A toolchain that has not adopted the claim may read a passing-scope list — a committed file naming nodes whose evidence exists while their implementation is absent, so the deterministic gate skips them. The list is operational configuration the skill that declares it reads without the foundation marker; it declares no state, and the claim supersedes it: a reference without an open-lifetime pass is already unscheduled, so the claim needs no exclusion list. Never present the list as the current design, and never infer from its presence that the claim is unsupported.

</passing_scope_list>
