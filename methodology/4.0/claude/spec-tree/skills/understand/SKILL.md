---
name: understand
description: >-
  ALWAYS invoke this skill when the live SPEC_TREE_FOUNDATION marker is absent
  before direct filesystem access under spx/ or before reading, searching,
  listing, or changing source or test files. NEVER access that product content
  without loading this skill first.
allowed-tools: Read, Glob, Grep
---

<objective>

The complete Spec Tree foundation loaded eagerly in one skill payload and recorded by a live `<SPEC_TREE_FOUNDATION>` marker.

</objective>

<truth_hierarchy>

<layer_precedence>

**TRUTH FLOWS DOWN.** The Spec Tree is the durable map of intent, decisions, assertions, evidence, and implementation obligations, rooted in `spx/`. Each layer depends on the layer above:

```text
Root product spec
-> decision records (PDR, ADR)
-> specs
-> evidence (tests, evals, audits, probes)
-> code and generated artifacts
```

When layers disagree, the lower layer is in violation and changes. Learning returns upward through human judgment — observed use, discovery, implementation, evidence, and Review inform a deliberate truth evolution, after which lower layers reconcile again; evidence can challenge product truth and never silently becomes it.

- NEVER: weaken a decision to match a spec, a spec to match evidence, or evidence to match code.

</layer_precedence>

<product_content>

- ALWAYS: treat as product content every product artifact a spec node governs or must govern, and derive its governing node before reading or modifying it.
- ALWAYS: contextualize a node before discussing it and before reading or modifying any product content it governs; a compaction empties the set of contextualized nodes.
- NEVER: read or modify product content that has no governing node — record the coverage gap.

Product content is every artifact of the product a spec node governs or must govern: source, tests, evals, probes, generated output, specs, decisions, outcome records, status claims, notes, and configuration a spec declares; implementation is its code layer. Governance is derived, never assumed: a path under `spx/<node>/` is governed by that node; any other path by the node whose linked test, eval, or probe reaches it, or whose spec or decision names that path in an `[audit]` assertion; several matching nodes resolve to their lowest common ancestor. That lookup is a search under the live foundation marker and opens no file body. Product content with no governing node is a coverage gap: it is not read or modified, and the gap is recorded.

Not product content: operational configuration — the `spx/local/` overlays, and a passing-scope list a toolchain that has not adopted the status claim still reads, which the skill that declares them reads without the marker — and the agent harness's own instruction and settings files, tool and command output, the session store, and scratch space. Work that touches no product content — PR inspection, check wait, merge, deploy, release, `spx session` operations, occupancy proof — is an operational continuation and triggers neither `/understand` nor `/contextualize`.

</product_content>

<future_product_truth>

- ALWAYS: higher-level truth remains authoritative while coherent, even when lower layers have not caught up.

A coherent product spec, PDR, ADR, or ancestor spec stays authoritative when lower layers have not caught up. Evaluate declaration validity separately from implementation completeness. Current code shape is evidence about code, never authority over higher layers; a toolchain's current limit is a fact about the toolchain, never a gate on what a declaration may state.

</future_product_truth>

<decision_to_spec_alignment>

- ALWAYS: align every first affected lower spec in the same changeset as a higher-level truth change.

Remaining evidence or implementation work is downstream work recorded in a Change (see `<coordination_model>`), never in a node-local note. A node whose declaration leads its implementation merges as Declared or Specified; that state exposes the work and never licenses a lower layer to contradict the declaration.

</decision_to_spec_alignment>

<atemporal_voice>

- ALWAYS: specs state atemporal product truth and contain no history or journey language.

| Temporal                 | Atemporal                |
| ------------------------ | ------------------------ |
| “We discovered that X”   | “X ensures Y”            |
| “We need to address X”   | “The product provides X” |
| “Currently, the system…” | “The system…”            |

Read each sentence aloud; if it would sound wrong after the work ships, rewrite it. Dated history belongs in a knowledge root.

</atemporal_voice>

<single_location>

- ALWAYS: keep one home per fact — structure carries relationships, and a checkable link carries what structure cannot.

Two in-tree link shapes exist: a **node-local** relative path whose target lives inside the node and prunes with it (assertion links), and a **tree-absolute** path written literally from `spx/` (cross-subtree decision citations). A leading slash or a `../` climb fails validation; tooling derives every graph.

</single_location>

<declarations>

- ALWAYS: derive declaration state from specs, evidence, and implementation; never hand-maintain status.

Writing a spec makes a declaration; linked evidence makes it verifiable. Pruning a node removes its verification artifacts and exposes implementation no surviving node reaches. These operations do not exist: closing or archiving a spec, moving it to done, assigning state by hand, marking complete, weakening a spec to match code, or closing an outcome record. Done is a structural event, never a state.

</declarations>

</truth_hierarchy>

<node_model>

<identity_and_kinds>

- ALWAYS: give every node one `id`, one kind from its suffix, and one `{slug}.spec.md`; the root declares `kind: product` in front matter because no directory carries its suffix.

A node's `id` is a UUIDv7 in its spec's front matter, unique across the tree, surviving re-indexing and re-placement. Below the root the directory suffix names the kind and role.

| Suffix        | Role                     | Opening                                  |
| ------------- | ------------------------ | ---------------------------------------- |
| `.product`    | Product scope            | none                                     |
| `.substrate`  | Primitive mechanics      | `SUPPLIES ... SO THAT ... CAN ...`       |
| `.capability` | Reusable behavior        | `PROVIDES ... SO THAT ... CAN ...`       |
| `.domain`     | Bounded semantics        | `OWNS ... SO THAT ... CAN ...`           |
| `.interface`  | Consumption contract     | `ADAPTS ... FOR ... SO THAT ... CAN ...` |
| `.surface`    | Provided boundary        | `EXPOSES ... TO ... SO THAT ... CAN ...` |
| `.variant`    | Exclusive implementation | its parent's form                        |

A substrate owns primitives with no product-domain semantics; a capability one reusable behavior with meaning outside any one consumer; a domain a bounded semantic context — vocabulary, rules, invariants — that other nodes speak; an interface a medium-agnostic consumption contract with no rendering; a surface the outside-facing boundary with no product semantics; a variant one implementation of its parent's whole contract among those the selection source serves. Five kinds are outputs in a fixed order — `substrate ≺ capability ≺ domain ≺ interface ≺ surface` — and a variant takes its parent's place; a provider is never a more-outward kind than its consumer. The `FOR` and `TO` slots carry the consumption context or external audience, never a consumer node; a provider never names its consumers; openings never carry paths.

Classify by the ordered procedure — product, variant, substrate, surface, interface, domain, capability — where the first test that holds fixes the kind; `${CLAUDE_SKILL_DIR}/references/kind-decision.md` carries the tests, the settling boundaries, and the structural-quality scorecards.

**Containment.** A node admits children of its own kind and any more-foundational output kind; every output kind additionally admits `.variant`; a `.variant` admits what its parent admits except another `.variant`; a `.product` admits any output kind, and only a `.product` admits a `.product`, so products form a spine from the root. Role-named wrapper directories do not exist: grouping is product name plus suffix, and a family surface owns its concrete surfaces as children. A tree authored under a 3.x version carries `.enabler` and `.outcome` directories with `{slug}.md` specs, a `*.product.md` root, and `PLAN.md` notes until its toolchain admits this grammar; a provider that supports that version parses both forms.

</identity_and_kinds>

<product_scope>

- NEVER: give a `.product` an assertion, malleability, state, status claim, outcome record, or child enumeration.

The operator judges a scope a product with three questions: does it need a surface or interface the tree lacks; does it run, ship, and transfer as a whole on its own; does it have its own backlog, checkout, and owner. A valid product spec is its front matter and title; a paragraph, product-local semantics, boundaries, and a Change-retention policy appear only where they change what a descendant does or how it is judged.

</product_scope>

<decomposition>

- ALWAYS: separate a node into children on a countable trigger — two or more distinct concepts, present or foreseen, or too many assertions for one node.

A parent states its class contract and names no child; the tree walk surfaces children. Behavior stays with the node that owns its meaning until two or more semantic owners share it or it has its own lifecycle and verification contract; then one provider is extracted. `/decompose` owns kind classification, placement, and index assignment.

</decomposition>

<files_in_a_node>

- ALWAYS: use the canonical node shape and co-locate each evidence lane under its governing node.

```text
NN-{slug}.{kind}/
├── {slug}.spec.md                      # front matter: id; malleability on output nodes
├── spx.status.json                     # machine-written status claim; every output node
├── NN-{decision}.{adr|pdr}.md          # decision records share the sibling index space
├── {slug}.outcome.md                   # optional outcome record; never on a product or variant
├── ISSUES.md                           # the only node-local note
├── knowledge/                          # optional OKF bundle: index.md and log.md required
├── tests/                              # [test] files in the project's naming convention
├── evals/{rule-slug}/eval.toml         # [eval] rules; cases, prompt, history beside it
├── probes/{probe-slug}/probe.md        # [probe] protocols with the attested run's artifacts
└── NN-{child-slug}.{kind}/
```

- The spec is `{slug}.spec.md`, repeating the directory's slug; at the root it repeats the product's name.
- `[test]` evidence is co-located under `tests/`; each filename encodes subject, assertion type, execution level, and an optional runner in the project's language convention.
- `[eval]` evidence is co-located under `evals/{rule-slug}/`: `eval.toml` plus the case, prompt, and template artifacts it declares by eval-relative path — canonically `cases.jsonl`, `prompt.md`, and `prompt.template.md`. A declared case or prompt path may reach a sibling eval's shared artifact; a declared template stays inside the eval directory. A declared producer source is a repository path outside the eval directory, never a co-located artifact. The eval harness generates `history.jsonl` and the ignored `runs/` transcripts at fixed names it owns; `eval.toml` never declares them.
- `[probe]` evidence is co-located under `probes/{probe-slug}/`: `probe.md` records intent, environment and preconditions, the protocol, the attested run's observations, the Author's verdict, and limitations, linking every retained artifact — at least one inspectable artifact beside the prose; working runs stay in an ignored `runs/`.
- The outcome record carries an `id`, one or more directional conditions each linking its metric source, and a selection-source link when the node holds variants — no value, threshold, impact, assertion, or state. A variant carries none; its outcomes belong to the parent.
- `knowledge/` is a node's one reserved memory root: dated entries, newest-first `log.md`, an `index.md` per directory, typed front matter on every non-reserved file. It declares no truth and prunes with its node.
- ADRs and PDRs are files inside the node whose subtree they govern, never child nodes; the root holds only root-scope records.

`${CLAUDE_SKILL_DIR}/references/grammar.md` carries the structural grammar in EBNF, the front matter fields, the index and fractional-insert forms, and the link forms.

</files_in_a_node>

</node_model>

<artifact_placement>

- ALWAYS: classify content by the artifact purpose that owns it.

The taxonomy is closed: `spx/` admits no artifact outside this table, the canonical node shape, and the optional knowledge root. Operational files under `spx/local/`, and a passing-scope list a toolchain that has not adopted the status claim still reads, are configuration. The note raises no placement question. Placement decides only between the governing layer (ADR or PDR) and the declaring layer (spec). Verification and implementation artifacts are never placed by classification: assertion tags derive evidence locations, and verification reachability with the language's declared infrastructure home derives implementation locations.

| Artifact            | Purpose                                            | Verified by                                  |
| ------------------- | -------------------------------------------------- | -------------------------------------------- |
| Product spec        | Declares scope and product-owned terms             | Review                                       |
| ADR                 | Governs how the product is built                   | ADR audit                                    |
| PDR                 | Governs what users can rely on                     | PDR audit                                    |
| Output spec         | Declares one output's contract and assertions      | Linked evidence                              |
| Variant spec        | Declares what its parent's contract does not say   | The parent's evidence under its selection    |
| Outcome record      | Declares the conditions an output moves            | Delivery reads the metric source             |
| Status claim        | Records derived state and attributed results       | The projector                                |
| Test file           | Proves one typed assertion class                   | Test runner                                  |
| Eval rule           | Scores a producer's structured output              | Eval harness                                 |
| Probe protocol      | Attests the running node's fidelity                | Attested run; pins checked in CI             |
| Test infrastructure | Provides harnesses, generators, and inert fixtures | Code, architecture, and test-evidence audits |
| Enforcement         | Constrains source structure                        | Tests against violating fixtures             |
| `ISSUES.md`         | Records known defects, contradictions, and gaps    | Reconciliation on context load               |
| Knowledge root      | Keeps dated organizational memory                  | Never; it governs nothing                    |

ADR versus PDR is decided by content: an ADR governs architecture the product's users cannot observe; a PDR governs behavior they can. A decision record is a file inside the node whose subtree it governs, at the position every later reader loads it from; a lower-index record constrains higher-index siblings and their descendants. When a decision's owner is unclear, decompose the structure first and author the record afterwards. Tree position determines reach, so broad reach never determines type, and a root record is one every subtree obeys.

Test-infrastructure boundaries and the placements this taxonomy rules out are in `${CLAUDE_SKILL_DIR}/references/artifact-placement.md`: files under `spx/<node>/tests/` hold typed assertion evidence only; harnesses, generators, and inert fixtures are governed production code in the language's declared infrastructure home, owned by the output node whose behavior they mediate, never a top-level infrastructure-testing subtree and never “test support,” “helpers,” “utilities,” or “tools”; a child `[test]` rule may concretize an ancestor `[audit]` rule, while same-content repetition with the same mechanism is duplication.

</artifact_placement>

<assertion_model>

Assertions declare observable product output at the layer that owns the behavior, derived from decisions and specs, never from tests or code. A broad assertion stays on the parent; a behavior-specific one belongs to the child.

<verification_types>

- ALWAYS: choose exactly one verification type before choosing any test assertion type.

| Type     | Tag                   | Verdict mode  | Use                                                                       |
| -------- | --------------------- | ------------- | ------------------------------------------------------------------------- |
| test     | `[test](path)`        | Deterministic | Behavior is a deterministic function of inputs.                           |
| evaluate | `[eval](path)`        | Deterministic | LLM-driven behavior emits a parseable verdict scored against cases.       |
| probe    | `[probe](path)`       | Attested      | A claim about the running node that only an executed observation settles. |
| audit    | `[audit:{rule-slug}]` | Agentic       | A semantic constraint with no structural verdict to score.                |

Validate and Review back no assertion. Authoring declarations await selection untagged directly under `## Assertions` or a decision's `## Verification`, alongside routed subsections if present. Audit judges their declaration quality; approval proves neither evidence completeness nor Passing. Once routed, a spec-malleable assertion may omit its tag; every harder assertion carries exactly one. A toolchain without slug support retains pathless `[audit]`. A dangling `[test]`, `[eval]`, or `[probe]` link derives Declared without a structural defect. Audit slugs are unique within their spec and key status-claim results.

</verification_types>

<assertion_types>

- MUST: assign one assertion type only to `[test]` evidence and derive it from the claim's quantifier.

| Assertion type | Quantifier                       | Test strategy             | Use                                                     |
| -------------- | -------------------------------- | ------------------------- | ------------------------------------------------------- |
| Scenario       | There exists                     | Example-based             | One concrete interaction, journey, error, or edge case. |
| Mapping        | For all over a finite set        | Parameterized             | Known input-output or state correspondence.             |
| Conformance    | External or internal oracle      | Validator/tool comparison | Schema, protocol, or declared contract.                 |
| Property       | For all over an open value space | Property-based            | Invariant for every valid input.                        |
| Compliance     | ALWAYS/NEVER rule                | Violating fixtures        | A deterministic behavioral boundary.                    |

A universal is never a scenario. Choose mapping for a finite source-owned domain, conformance for an oracle, compliance for a rule exercised against violations, and property for an open domain; choose scenario only for one existential interaction. Evaluate, probe, and audit carry no assertion type.

</assertion_types>

<verification_selection>

- MUST: select test, evaluate, probe, or audit evidence from the verdict the real subject can produce.

Prefer `[test]` when behavior is deterministic; `[eval]` when the real LLM-driven producer emits a parseable contract a runner can score; `[probe]` when only observing the running node settles the claim; `[audit]` when no deterministic, attested, or structural verdict exists. A structural lint constraint is `[test]` evidence run against violating fixtures.

</verification_selection>

<mixing_types>

- ALWAYS: group mixed `[test]` assertions by assertion type and cite every node and decision by its complete `spx/...` path.

Each test file carries one assertion type; bare names such as `32-parser.capability` are ambiguous because other directories may reuse the prefix.

</mixing_types>

</assertion_model>

<ordering_model>

<index_semantics>

- ALWAYS: place prerequisites before consumers; numeric separation alone establishes no dependency.

Nodes and decision records in one directory share one two-digit index space, extended by fractional inserts (`20.54`). An earlier node's contract is available as a prerequisite and constrains work that consumes it or falls within its stated scope; an unrelated earlier contract supplies awareness and creates no dependency. Same-index peers cannot supply prerequisites to each other, and independent siblings may occupy different indices. A lower-index decision record governs higher-index siblings and their descendants. An index never encodes roadmap order, time, or priority.

</index_semantics>

<assignment>

- MUST: assign an index from the consumer's own prerequisites, with a falsifiable reason for each, after checking the kind order.

Ask only what the node depends on and place it above each provider it names; never place a provider by asking what depends on it. A substrate depending on a surface, or a capability on a domain, is an inversion or misclassification to resolve first. Reuse an existing peer index when it satisfies the prerequisites and decision scope; the next free number is no default slot. Valid evidence: provider/consumer, logical prerequisite, vertical slice, shared substrate, feature extension, decision constraint. `/decompose` owns assignment.

</assignment>

<context_walk>

- ALWAYS: derive context as a pure function of the tree: every ancestor spec from the root, every sibling's published contract and decision record at each level along the path, every note on the path, the immediate children's contracts when the target is the work, then the target's own spec.

Siblings and children enter as published contracts, never subtree internals. `tests/`, `evals/`, and `probes/` stay out. The target's knowledge root contributes its `index.md` only; the target's outcome record loads with its spec; other records stay out. Cited cross-subtree decisions resolve into the read-set once with provenance; an unresolvable citation is a defect. No keyword search, embedding similarity, or agent-judged relevance. When the payload routinely exceeds a reliable working set, restructure the overloaded dimension rather than filter.

</context_walk>

</ordering_model>

<verification_model>

<axes>

- ALWAYS: classify verification by verdict mode and purpose.

**Verdict mode** names how the verdict is produced, never who produced the subject: **Deterministic** — an executable oracle scores fixed expectations; **Agentic** — a Verifier applies a skill and judges; **Attested** — the Author's verdict with the inspectable evidence of an executed protocol. **Purpose**: **Conformance** — fit to methodology, standards, and configuration; **Correctness** — integrity of the decision → spec → evidence → code chain.

</axes>

<types>

- ALWAYS: use exactly the six verification types validate, test, evaluate, probe, audit, and review.

- **validate** — deterministic conformance to configured tool standards, including the tree's structural and link contracts; runs on every change; backs no tag.
- **test** — deterministic execution of behavior; backs `[test]`.
- **evaluate** — deterministic scoring of structured producer output; backs `[eval]`.
- **probe** — attested fidelity of the running node through an executed protocol; backs `[probe]`.
- **audit** — agentic conformance or correctness judgment against an assertion's declared criteria; backs `[audit:{rule-slug}]`.
- **review** — agentic open-ended judgment over the whole change, including each affected output node's spec against its malleability's expectations; backs no tag.

A type's verdict mode is fixed, so whoever runs it reaches the same verdict, and a model never judges a deterministic verdict. The type set and the three modes never expand without amending this foundation and its governing decision. Evidence is what verification produces and commits; a test file, eval rule, or probe protocol is the assertion made executable, never evidence. Every attributed result carries a pin naming the declaration, the artifact, and the subject; a change to any pinned path invalidates it — test and evaluate run again, audit receives a new judgment, probe a fresh attested run.

</types>

<malleability_and_state>

- ALWAYS: derive an output node's state from its evidence against the malleability it declares.

**Malleability** is the highest layer that remains cheap to change, declared in front matter; the absent field means `implementation`, the floor. Hardening lowers it one layer at a time through a Change whose target malleability is lower than the declared one.

| Malleability     | Phase        | Still cheap to change              | Verification required for Passing                                          |
| ---------------- | ------------ | ---------------------------------- | -------------------------------------------------------------------------- |
| `spec`           | prototype    | spec, verification, implementation | Validate, reachability tests, and every tagged assertion result            |
| `verification`   | experimental | verification, implementation       | Validate and a tagged result for every assertion                           |
| `implementation` | production   | implementation                     | Validate and a result for every assertion, with evidence that passes audit |

A reachability test is a `[test]` file that executes the node's entry points and pins its API shape while asserting the minimum, so coverage attribution stays uniform while iteration stays free. **State** is the node's own claim against that declaration: **Declared** — the spec exists and required artifacts are missing; **Specified** — required artifacts exist without a current passing result; **Passing** — Validate passes and every required result is current and passes; **Failing** — a required result becomes invalid or stops passing after Passing under unchanged declarations. An initial failure leaves Specified. A changed decision or spec invalidates every affected pin and derives the state anew. **Effective** malleability and state derive over the node's dependency closure and are never committed.

</malleability_and_state>

<projection>

- NEVER: author state or the status claim — the projector is its only writer.

Every output node carries `spx.status.json`: its state, the malleability measured against, and attributed results keyed by tagged path (audit by rule slug), each `passed`, `failed`, or `not-run`, with a pin and, for Agentic and Attested results, actor provenance and a run; a conflicted claim is regenerated. Merge gates a changeset by the least malleable node it touches: Validate always; Review for a verification-malleable node; the evidence audits before Review for an implementation-malleable node; product and outcome-record changes run Validate and Review regardless. Every changed implementation file is reached by some node's linked verification. A Declared or Specified node merges as itself; a Failing node blocks; a passing consumer's dependency change may neither raise a malleability nor make any node in its closure cease Passing. `${CLAUDE_SKILL_DIR}/references/status-claims.md` carries the claim's shape and derivation.

</projection>

<vocabulary_boundaries>

- MUST: resolve overlapping verification vocabulary against this foundation before judging a name defective.

When vocabulary overlaps another grammar, resolve verification vocabulary here first and inspect history before classifying a name as defective. Generated output and implementation names are lower-layer evidence.

</vocabulary_boundaries>

<commit_before_another_session_reads>

- ALWAYS: when repository writes are authorized, commit the exact current version before another agent session or human reads it for collaboration or reusable verification; without repository-write authorization, defer a reading that requires a committed subject.

The commit records verification state as `passing`, `failing`, or `not-run`; that state controls gate eligibility, never commit permission. An advisory audit or review may inspect uncommitted work, but its verdict is not reusable gate evidence. An agentic gate additionally requires applicable deterministic verification to pass on the exact committed subject.

</commit_before_another_session_reads>

</verification_model>

<coordination_model>

- ALWAYS: keep mutable work state outside the durable map — in Changes, Handoffs, and `ISSUES.md` — and never let it declare product, architecture, or methodology truth.

A **Change** is the mutable coordination object for one intended Output: a decision or spec evolution, a lower-layer reconciliation, or both. It carries its Product, received input, what makes the work worth doing, and — as refinement adds them — Nodes, Assertion operations, Decision references, Activities, and blockers. **Maturity** advances Proposed → Framed → Sliced → Executable; Framed needs human judgment and the operator's attestation, a person stays accountable for Sliced, and Claude may advance Sliced to Executable inside the Frame. **Status** is Available, Claimed, Applied, Refined, or Abandoned; execution begins only on a Claimed, Executable lineage leaf with Refined predecessors and no unresolved blocker. Successors name their predecessors in an immutable `refined_from` set. A **Handoff** is the latest persisted continuation — branch or changeset, completed and next Activities, blockers, hazards, never a secret.

**Roles**, capitalized: the **Refiner** holds the Change during refinement and is the operator's conversation, realized by loading the refinement skills into it; the **Executor** holds it during execution, sequences Activities, delegates, integrates, and produces no artifact; the **Author** produces one round's artifacts; the **Fixer** is a later round's Author; the **Verifier** produces an Agentic verdict — an Auditor for audit, a Reviewer for review. Author, Fixer, and Verifier hold no claim.

When Claude calls both the Author and the Fixer, they must use separate agent sessions. When the operator calls the Author, the same session must also act as the Fixer whenever the operator requests, for as many rounds as necessary.

`ISSUES.md` is the only node-local note: known defects, contradictions, and gaps with evidence, impact, and a settlement condition, and no work order, owner, priority, or next action. Notes inform judgment and never supply authority; reconcile every loaded note against current decisions, specs, evidence, and intent before acting. `spx/local/` holds product-specific overlays read by the skill that declares each; `spx/local/merging.md` is the lifecycle overlay `/merge` and `/contextualize` read; the coordination overlay names where the repository's Changes live.

</coordination_model>

<imperfection_protocol>

<recording>

- ALWAYS: record every observed imperfection immediately with its evidence, governing workflow, handling, and classification.

The current-turn ledger takes every imperfection — failing validation, broken link, stale reference, dead code, missing evidence, misplaced file, wrong index, or anything else that is not right — with what exposed it, the workflow governing the fix, and the proposed handling. Apply clear, local, low-risk corrections immediately. Surface a blocking decision through the structured-question tool. Hold a non-blocking decision only until the next natural checkpoint.

</recording>

<no_origin_distinction>

- NEVER: reduce responsibility for an imperfection because of its age, author, or originating change.

Never dismiss an imperfection as inherited, already broken, or outside the current change because another change created it, and never investigate origin to reach that judgment — Claude's commits sign as the operator, so no lookup separates Claude's earlier work from the operator's. Origin changes nothing about the fix.

</no_origin_distinction>

<touched_file_debt>

- ALWAYS: fix debt that the current change causes, surfaces, or invalidates.

A change invalidates another file when it removes a symbol that file references, enforces a rule it violates, falsifies its guidance, or causes a gate, audit, or review to expose its imperfection. Location never licenses deferral. Record and proceed only for work independent of the current change in a surface the change neither touches nor invalidates, at the correct tier: decision or spec for durable truth, methodology for reusable workflow, a Change for pending work, `ISSUES.md` for a known defect with its settlement condition. Recording never ends an otherwise actionable session.

</touched_file_debt>

<expense_ceiling>

- NEVER: raise a cost, quota, worker, retry, timeout, or external-capacity ceiling without operator approval in the same turn.

Command defaults are authority for cost-bearing and quota-bearing runs. When a default ceiling blocks a run, report the command, the ceiling, and the proposed increase.

</expense_ceiling>

<closing_protocol>

- ALWAYS: continue actionable in-scope work; close out only when no continuation remains or continuation is impossible.

Apply the closing test: can the operator reasonably ask “What now?” A passing check, merge, clean worktree, or persisted note is a milestone, never permission to stop while do-able work remains. Dispose of the held Change only when the goal is met or continuation is impossible: `/close-change` when the Change reached its terminal Lifecycle, `/release-change` with a Handoff when continuation remains for another holder; a conversation holding no Change records remaining work as a Proposed Change through `/author-change`. When operator judgment is required, close with the structured-question tool rather than a prose offer.

</closing_protocol>

<spec_tree_integration>

- ALWAYS: keep the live ledger conversation-local and persist unresolved items only at their correct durable or coordination tier.

Fixed entries disappear. Unresolved entries persist only through a decision, spec, Change, or `ISSUES.md`.

</spec_tree_integration>

</imperfection_protocol>

<delivery_boundary>

- ALWAYS: no value is delivered until the changeset reaches the default branch on origin through `/merge`. Local edits, tests, audits, reviews, commits, pushes, and clean branches are checkpoints.

Continue through `/merge` unless the operator explicitly limited the request to proposal, analysis, review, branch-only, or local-only work; a terse “continue,” “ship it,” or “finish” continues the active lifecycle. A blocker exists only when the next action needs operator input or an external state change, every independent local action is complete, and the applicable gates have run or produced concrete failing evidence.

</delivery_boundary>

<workflow>

1. Load this complete inline foundation on every invocation. A marker in a compaction summary, Handoff, or prior-run statement does not count. After compaction, treat the marker as absent until this workflow emits it again.
2. Check internal consistency across every foundation section and surface any contradiction immediately. No mandatory foundation reference read follows this step.
3. Locate these operational references and list their paths without reading them until another skill needs them: `${CLAUDE_SKILL_DIR}/references/kind-decision.md`, `${CLAUDE_SKILL_DIR}/references/grammar.md`, `${CLAUDE_SKILL_DIR}/references/artifact-placement.md`, `${CLAUDE_SKILL_DIR}/references/status-claims.md`, `${CLAUDE_SKILL_DIR}/references/product-domain-shapes.md`, and `spx/local/*.md`. Note discovery belongs to `/contextualize`, never to `/understand`.
4. Read `spx/local/merging.md` when present. Changes destined for the default branch route through `/merge`; absence of the overlay applies the default lifecycle.
5. Locate templates under `${CLAUDE_SKILL_DIR}/templates/` — `product/product-name.spec.md`, `decisions/decision-name.{adr,pdr}.md`, `nodes/{substrate,capability,domain,interface,surface,variant}-name.spec.md`, `records/node-name.outcome.md`, `probes/probe.md` — and `${CLAUDE_SKILL_DIR}/examples/*.md`. Record the resolved absolute template directory as `Template root` in the marker; consuming authoring and audit workflows read their required templates there.
6. Read the complete root `CLAUDE.md` from disk only when the live conversation does not already carry it complete; a harness that injects the whole file satisfies this step, and a truncated or absent injection requires the read. It routes skill invocation, names the repository's methodology declaration, and carries product commands.
7. Emit the marker:

```text
<SPEC_TREE_FOUNDATION>
Loaded inline: truth-hierarchy, node-model, artifact-placement, assertion-model, ordering-model, verification-model, coordination-model, imperfection-protocol
Operational references available: kind-decision, grammar, artifact-placement, status-claims, product-domain-shapes
Local lifecycle route: /merge, refined by spx/local/merging.md when present
Default-branch completion: /merge delivers to origin's default branch; local work continues unless explicitly limited or a gate blocks every remaining action
Routing guide: CLAUDE.md carried complete by the harness | read from disk | absent
Templates available: product, adr, pdr, substrate, capability, domain, interface, surface, variant, outcome-record, probe
Template root: <resolved absolute template directory>
Examples available: adr, pdr, capability, domain, outcome-record, probe
</SPEC_TREE_FOUNDATION>
```

</workflow>

<failure_modes>

**Mandatory references made progressive disclosure fictional.**

Claude loaded `SKILL.md`, then opened six references required on every fresh invocation; one aggregate read truncated, forcing repeat reads. Keep unconditional foundation truth inline and govern the total eager payload; reserve references for conditional detail, templates, and examples.

**Higher-level truth was shaped to current code.**

Claude rejected coherent decisions because implementation lagged or tooling could not realize them. Preserve the declaration, align first affected lower specs, and record downstream work in a Change.

**A pushed branch was reported as complete.**

Claude treated a transport checkpoint as delivered value. Continue through `/merge` until the changeset reaches the default branch on origin or an explicit gate blocks every remaining action.

</failure_modes>

<success_criteria>

- The foundation domains — truth hierarchy, node model, artifact placement, assertion model, ordering model, verification model, coordination model, imperfection protocol — are present inline and require no secondary file reads.
- Internal foundation sections contain no contradiction in truth flow, artifact ownership, kind grammar, assertion selection, ordering, verification vocabulary, coordination, or imperfection handling.
- Operational references, templates, examples, overlays, and the root guide are located or read according to the workflow.
- A live `<SPEC_TREE_FOUNDATION>` marker records the inline payload.

</success_criteria>
