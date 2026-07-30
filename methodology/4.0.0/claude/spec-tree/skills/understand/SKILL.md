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

**TRUTH FLOWS DOWN.** The Spec Tree is a durable, declarative map of what the product does. Its four layers depend on the layer above:

```text
PDR/ADR  →  Spec  →  Test  →  Code
governs     declares   verifies   complies
```

- PDRs and ADRs decide product and architecture truth.
- Specs declare product output in alignment with those decisions.
- Tests are executable evidence derived from specs.
- Code complies with tests.

When layers disagree, the lower layer is in violation.

- NEVER: weaken a decision to match a spec, a spec to match tests, or tests to match code.

</layer_precedence>

<future_product_truth>

- ALWAYS: higher-level truth remains authoritative while coherent, even when lower layers have not caught up.

Higher-level truth may lead implementation. A coherent product spec, PDR, ADR, or ancestor spec stays authoritative when lower specs, tests, or code have not caught up. Evaluate declaration validity separately from implementation completeness. Current code shape is evidence about code, never authority over higher layers.

</future_product_truth>

<decision_to_spec_alignment>

- ALWAYS: align every first affected lower spec in the same changeset as a higher-level truth change.

When a higher-level artifact changes, align every first affected lower spec in the same changeset. If tests or code remain, record the concrete next step and governing artifact in `PLAN.md` at the first affected lower node. Use `ISSUES.md` for known imperfections or contradictions. Use `spx/EXCLUDE` only when a node has specs and tests while implementation is absent; exclusion never resolves a conceptual disagreement or permits lower layers to contradict decisions.

</decision_to_spec_alignment>

<atemporal_voice>

- ALWAYS: specs state atemporal product truth and contain no history or journey language.

Specs declare atemporal truth. Eliminate history and journey language:

| Temporal                           | Atemporal                |
| ---------------------------------- | ------------------------ |
| “We discovered that X”             | “X ensures Y”            |
| “We need to address X”             | “The product provides X” |
| “Currently, the system…”           | “The system…”            |
| “After investigating, we decided…” | “The decision governs…”  |
| “This was introduced because…”     | “The output enables…”    |

Read every spec sentence aloud. If it would sound wrong after the work ships, rewrite it.

</atemporal_voice>

<declarations>

- ALWAYS: derive declaration state from specs, evidence, and implementation rather than hand-maintained status.

Writing a spec makes a declaration. Writing linked evidence makes the declaration verifiable. Removing a spec prunes product truth. The following backlog operations do not exist:

- close, archive, or move a spec to done;
- assign or store a spec status;
- mark a declaration complete by hand;
- weaken a declaration to match its implementation.

</declarations>

<node_states>

- ALWAYS: derive each node state from the presence of its spec, evidence, implementation, and evidence result.

A node's state is derived:

- **Declared** — spec exists, no evidence.
- **Specified** — spec and evidence exist while implementation is absent; the node is covered by `spx/EXCLUDE`.
- **Failing** — implementation exists and evidence fails.
- **Passing** — implementation exists and evidence passes.

Specified and failing are valid states. They expose where lower layers must catch up.

</node_states>

</truth_hierarchy>

<artifact_placement>

- ALWAYS: classify content by the artifact purpose that owns it.

| Artifact                | Purpose                                            | Contains                                             | Verified by                                  |
| ----------------------- | -------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| ADR                     | Governs how the product is built                   | Architecture decisions, rationale, invariants        | ADR audit                                    |
| PDR                     | Governs what users can rely on                     | Product decisions and observable properties          | PDR audit                                    |
| Enabler spec            | Declares infrastructure output                     | `PROVIDES ... SO THAT ... CAN ...` and assertions    | Linked evidence                              |
| Outcome spec            | Declares an output hypothesis                      | Output, outcome, impact, and assertions              | Linked evidence                              |
| Test file               | Proves one typed assertion class                   | Executable assertion evidence                        | Test runner                                  |
| Test infrastructure     | Provides harnesses, generators, and inert fixtures | Governed production code outside `spx/` and `tests/` | Code, architecture, and test-evidence audits |
| Enforcement             | Constrains source structure                        | Lint rules, AST selectors, and pattern matchers      | Tests against violating fixtures             |
| `PLAN.md` / `ISSUES.md` | Coordinates pending work or known imperfections    | Stale-prone node-local context                       | Reconciliation on context load               |

ADR versus PDR is decided by content. An ADR governs architecture invisible to the product's users; a PDR governs behavior those users observe. Tree position and numeric prefix determine a decision's reach, so broad or foundational reach never determines its type. Product users differ by product: test-infrastructure layout can be product behavior for a methodology and architecture for an application.

<test_artifact_boundaries>

- ALWAYS: keep executable assertion files separate from the production infrastructure they consume.

Files under `spx/<node>/tests/` contain typed assertion evidence only. Harnesses mediate systems, generators produce variable domains, and fixtures are inert whole-payload inputs read by path. These artifacts are governed production code in the location declared by the active language's test standards, outside `spx/` and every `tests/` directory.

Test infrastructure follows normal spec composition. Govern it through the naturally placed node whose assertions or category contract own its behavior. Never fabricate a top-level `infrastructure -> testing -> {harnesses, generators, fixtures}` subtree solely because test infrastructure exists. Avoid the anti-terms “test support,” “test helpers,” “test utilities,” and “test tools,” which hide governed production behavior behind an unowned utility category.

Enforcement rules are production validation code. Their `[test]` evidence runs the rule against violating fixtures and proves detection; a green validation pipeline separately proves registration.

</test_artifact_boundaries>

<common_misplacements>

- NEVER: preserve content in an artifact whose purpose does not own it.

| Content                                 | Wrong location     | Correct location                                              |
| --------------------------------------- | ------------------ | ------------------------------------------------------------- |
| Architecture choice                     | Spec               | ADR                                                           |
| Product decision or user guarantee      | Spec               | PDR                                                           |
| Outcome hypothesis                      | ADR/PDR            | Outcome spec                                                  |
| Test reference                          | ADR/PDR            | Spec assertion                                                |
| Implementation detail                   | Spec               | Code                                                          |
| How to build something                  | Spec               | ADR or code                                                   |
| Enforceable static constraint           | `[audit]`          | `[test]` on the enforcement rule                              |
| Cross-cutting invariant                 | Child spec         | Ancestor spec                                                 |
| Remaining work                          | Session file       | Node-local `PLAN.md`                                          |
| Known unresolved imperfection           | Session file       | Node-local `ISSUES.md`                                        |
| Pending work induced by higher truth    | Higher declaration | First affected lower node's `PLAN.md` after lower specs align |
| Child enumeration                       | Parent spec        | Child specs and `/contextualize` output                       |
| Harness, generator, or fixture behavior | Executed test file | Language-standard test-infrastructure location                |

Evidence specialization is valid when a child `[test]` rule concretizes an ancestor `[audit]` rule against a narrower source surface. Same-content repetition using the same evidence mechanism is duplication.

</common_misplacements>

</artifact_placement>

<node_model>

The tree contains exactly two recursive node types.

<enabler>

- MUST: classify deterministic shared capability with stable additive assertions as an enabler.

**Enabler**

- Directory suffix: `.enabler`
- Spec opening: `PROVIDES ... SO THAT ... CAN ...`
- Purpose: infrastructure removed when all dependents retire.
- Use for shared infrastructure, deterministic capabilities, and output whose assertions are stable and grow by addition.

</enabler>

<outcome>

- MUST: classify a user-behavior hypothesis with material output uncertainty as an outcome.

**Outcome**

- Directory suffix: `.outcome`
- Spec opening: `WE BELIEVE THAT ... WILL ... CONTRIBUTING TO ...`
- Purpose: a bet that one output will produce a measurable user-behavior change contributing to business impact.
- Assertions specify the output. The outcome and impact remain hypotheses requiring real users.
- Use when material uncertainty remains about which output achieves the goal and most assertions could change while the hypothesis stays stable.

Apply the forcing question before choosing an outcome: why can this not be written as `PROVIDES X SO THAT Y CAN Z`? A forced hypothesis signals an enabler.

</outcome>

<nesting_rules>

- NEVER: place an outcome beneath an enabler.

Valid node nesting:

| Parent  | Child nodes           |
| ------- | --------------------- |
| Outcome | Enablers and outcomes |
| Enabler | Enablers only         |

An enabler can never contain an outcome. If a proposed child under an enabler carries material output uncertainty, either the parent is mistyped or the child is an enabler whose output is fully determined.

</nesting_rules>

<common_structure>

- ALWAYS: use the canonical node shape and co-locate each evidence lane under its governing node.

Canonical node shape:

```text
NN-{slug}.{enabler|outcome}/
├── {slug}.md
├── tests/                              # when the first [test] file exists
├── evals/{rule-slug}/                  # when the first [eval] exists
├── PLAN.md                             # optional
├── ISSUES.md                           # optional
└── NN-{child-slug}.{enabler|outcome}/
```

- The spec file is `{slug}.md`, with no numeric or type suffix.
- `[test]` evidence is co-located under `tests/`; the directory materializes with the first test file, and its filename encodes one assertion type and execution level according to the product's language convention.
- `[eval]` evidence is co-located under `evals/{rule-slug}/` with `eval.toml`, `cases.jsonl`, `prompt.md`, and `history.jsonl`; full run transcripts stay ignored under `runs/`.
- `PLAN.md` and `ISSUES.md` are optional coordination notes, never product truth.
- ADRs and PDRs are files inside a node directory, never child nodes.

</common_structure>

</node_model>

<assertion_model>

Assertions specify locally verifiable product output. They derive from decisions and specs, never from tests or code.

<verification_types>

- ALWAYS: choose exactly one verification type before choosing any test assertion type.

Choose the verification type first:

| Type     | Tag            | Verdict                                                 | Use                                                                                 |
| -------- | -------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| test     | `[test](path)` | deterministic                                           | Behavior is a deterministic function of inputs.                                     |
| evaluate | `[eval](path)` | deterministic score over a producer's structured output | LLM-driven behavior emits a parseable verdict scored against cases and a threshold. |
| audit    | `[audit]`      | agentic                                                 | A semantic constraint has no structural verdict to score.                           |

Review is an open-ended changeset gate and backs no assertion tag.

</verification_types>

<assertion_types>

- MUST: assign one assertion type only to `[test]` evidence and derive it from the claim's quantifier.

Only `[test]` assertions carry one of five assertion types, selected from the quantifier:

| Assertion type | Quantifier                       | Test strategy             | Use                                                     |
| -------------- | -------------------------------- | ------------------------- | ------------------------------------------------------- |
| Scenario       | There exists                     | Example-based             | One concrete interaction, journey, error, or edge case. |
| Mapping        | For all over a finite set        | Parameterized             | Known input-output or state correspondence.             |
| Conformance    | External or internal oracle      | Validator/tool comparison | Schema, protocol, or declared contract.                 |
| Property       | For all over an open value space | Property-based            | Invariant for every valid input.                        |
| Compliance     | ALWAYS/NEVER rule                | Violating fixtures        | A deterministic behavioral boundary.                    |

A universal is never a scenario. Under `[test]`, choose mapping for a finite source-owned domain, conformance for an oracle, compliance for a rule exercised against violations, and property for an open domain. Choose scenario only for one existential interaction. Evaluate and audit carry no assertion type.

</assertion_types>

<verification_selection>

- MUST: select test, evaluate, or audit evidence from the verdict the real subject can produce.

Prefer `[test]` when behavior is deterministic. Use `[eval]` when the real LLM-driven producer emits a parseable contract that a runner can score. Use `[audit]` when no deterministic or structural verdict exists.

Structural lint constraints use `[test]` evidence that runs the rule against violating fixtures and proves detection. Pipeline inclusion is a separate operational concern established by the validation gate.

</verification_selection>

<mixing_types>

- ALWAYS: group mixed `[test]` assertions by assertion type and use full `spx/...` citations.

Group mixed `[test]` assertions by type. Each test file carries one assertion type. Every node, test, ADR, or PDR citation uses its full path from `spx/`.

</mixing_types>

</assertion_model>

<ordering_model>

<context_loading_rule>

- ALWAYS: interpret sibling integer prefixes as deterministic context-loading relationships.

All indexed artifacts inside one directory—nodes, ADRs, and PDRs—share one numeric namespace. Prefixes are sibling-local and drive deterministic context loading:

- Lower-index siblings constrain the target and their specs are read.
- Same-index siblings are independent peers; list them without reading them as constraints.
- Higher-index siblings may depend on the target; list them without reading them as constraints.
- A lower-index ADR or PDR constrains higher-index siblings and descendants.

</context_loading_rule>

<assignment_is_the_inverse>

- MUST: assign indices as the inverse of the context-loading rule and prove every ordered dependency.

Index assignment is the inverse of this read rule. Giving a new child a higher index declares that each lower-index sibling must be present in its future context. Giving peers the same index declares independence. `/decompose` owns assignment because it must prove the dependency consequence before choosing an index.

</assignment_is_the_inverse>

<full_paths>

- ALWAYS: cite every node and decision with its complete `spx/...` path.

Always use complete `spx/...` paths. `32-parser.enabler` and `15-build.adr.md` are ambiguous because other directories may reuse both prefixes.

</full_paths>

</ordering_model>

<verification_model>

Verification has five fixed types over two independent axes.

<axes>

- ALWAYS: classify verification independently by verdict mode and purpose.

**Verdict mode**

- **Deterministic** — a command scores fixed expectations and returns pass or fail; no model judges the result.
- **Agentic** — Claude applies a skill and judges the subject, from checklist audit to open-ended review.

**Purpose**

- **Conformance** — fit to methodology, language standards, and validation configuration.
- **Correctness** — integrity of the decision → spec → evidence → implementation chain.

</axes>

<types>

- ALWAYS: use exactly the five verification types audit, validate, review, evaluate, and test.

The five types are:

- **audit** — agentic conformance or mechanical correctness judgment; backs `[audit]`.
- **validate** — deterministic conformance through format, lint, typing, and static-analysis gates; backs no assertion tag.
- **review** — agentic open-ended correctness judgment over quality, architecture, risk, and layer consistency; backs no assertion tag.
- **evaluate** — deterministic scoring of structured producer output; backs `[eval]`.
- **test** — deterministic execution of behavior; backs `[test]`.

Every verification activity declares its type and purpose. A type's verdict mode is fixed. A model never judges a deterministic verdict. The type set and the two verdict modes never expand without amending this foundation and its governing decision.

</types>

<vocabulary_boundaries>

- MUST: resolve overlapping verification vocabulary against this foundation before judging a name defective.

When vocabulary overlaps another grammar, resolve verification vocabulary here first and inspect history before classifying a name as defective. Generated output and implementation names are lower-layer evidence.

</vocabulary_boundaries>

</verification_model>

<imperfection_protocol>

<recording>

- ALWAYS: record every observed imperfection immediately with its evidence, governing workflow, handling, and classification.

Record every observed imperfection in the current-turn ledger immediately: failing validation, broken link, stale reference, dead code, lint violation, missing evidence, inconsistent naming, misplaced file, wrong index, harmful warning, or anything else that is not right. Each entry carries:

- the exact imperfection;
- the path, line, command output, or external state that exposed it;
- the skill or workflow governing the fix;
- the proposed handling and current classification.

Apply clear, local, low-risk corrections immediately. Surface a blocking decision through the structured-question tool. Hold a non-blocking decision only until the next natural checkpoint.

</recording>

<no_origin_distinction>

- NEVER: reduce responsibility for an imperfection because of its age, author, or originating change.

The ledger has no origin distinction. Age and authorship never reduce responsibility. Never dismiss an imperfection as inherited, already broken, or outside the current change merely because another change created it.

Never investigate origin to reach that judgment — no blame, file history, or authorship lookup. Claude's commits sign as the operator, so the lookup cannot separate Claude's earlier work from the operator's, and compaction has erased what Claude knew. Origin changes nothing about the fix.

</no_origin_distinction>

<touched_file_debt>

- ALWAYS: fix debt that the current change causes, surfaces, or invalidates.

Debt the current change causes, surfaces, or invalidates is fix-now wherever it lives. A change invalidates another file when it removes a symbol that file references, enforces a rule it violates, falsifies its guidance, or causes a gate, audit, or review to expose its imperfection. Location never licenses deferral.

Record and proceed only for work independent of the current change in a surface the change neither touches nor invalidates. Persist that work at the correct tier: decision/spec for durable truth, methodology for reusable workflow, `PLAN.md` for pending node work, and `ISSUES.md` for known node imperfections. Recording never ends an otherwise actionable session.

</touched_file_debt>

<expense_ceiling>

- NEVER: raise a cost, quota, worker, retry, timeout, or external-capacity ceiling without operator approval in the same turn.

Command defaults are authority for cost-bearing and quota-bearing runs. Never raise an explicit or implicit spend, token, worker, retry, timeout, hosted-runner, paid-provider, or external-capacity ceiling without operator approval in the same turn. When a default ceiling blocks a run, report the exact command, ceiling, proposed increase, expected rerun scope, and pause/inspect option.

</expense_ceiling>

<closing_protocol>

- ALWAYS: continue actionable in-scope work and invoke `/handoff` only when no continuation remains or continuation is impossible.

Apply the closing test at task completion: can the operator reasonably ask “What now?”

- When the stated goal remains actionable, continue the governing workflow.
- A passing check, merge, clean worktree, or persisted note is a milestone, never permission to stop while do-able work remains.
- Run `/handoff` only when the goal is met with no continuation remaining or continuation is impossible because the operator halted work, context is exhausted, or an external blocker prevents the next action.
- Never write `PLAN.md` or a session file to postpone work Claude can perform now.
- When operator judgment is required, close with the structured-question tool rather than a prose offer.

</closing_protocol>

<spec_tree_integration>

- ALWAYS: keep the live ledger conversation-local and persist unresolved items only at their correct durable or coordination tier.

The ledger is conversation-local. Fixed entries disappear. Unresolved entries persist only through the correct durable or coordination artifact. Session files under `.spx/` carry ephemeral initialization context and remain outside Git.

</spec_tree_integration>

</imperfection_protocol>

<coordination_and_context>

- ALWAYS: `/contextualize` derives deterministic context from tree structure, never keyword search. It loads product truth, ancestry, lower-index constraints, decisions, cited governance, guides, coordination notes, and lifecycle routing for one canonical target.

Coordination notes are stale-prone inputs. Reconcile every loaded `PLAN.md` or `ISSUES.md` against current decisions, specs, evidence, implementation, and user intent before acting. They never declare product truth or cited governance.

- `PLAN.md` carries concrete pending steps for its node, including lower-layer work induced by a higher declaration.
- `ISSUES.md` carries known imperfections, contradictions, gaps, and untestable assertions.
- Session files remain operational state outside Git; they never replace node-local coordination.

`spx/local/` holds product-specific overlays for coding, architecture, testing, and lifecycle skills. Enumerate overlays during context loading and read each only when its governing skill requires it. `spx/local/merging.md` is the optional lifecycle overlay read by `/merge` and `/contextualize`.

</coordination_and_context>

<delivery_boundary>

- ALWAYS: no value is delivered until the changeset reaches the default branch on origin through `/merge`. Local edits, tests, audits, reviews, commits, pushes, and clean branches are checkpoints.

After verification and any successful commit or push, continue through `/merge` unless the operator explicitly limited the request to proposal, analysis, review, branch-only, or local-only work. A terse “continue,” “ship it,” or “finish” continues the active lifecycle.

A blocker exists only when the immediate next action needs operator input or an external state change, every independent local action is complete, and the applicable gates have run or produced concrete failing evidence.

</delivery_boundary>

<workflow>

1. Load this complete inline foundation on every invocation. A marker in a compaction summary, session file, handoff note, or prior-run statement does not count. After compaction, treat the marker as absent until this workflow emits it again.
2. Check internal consistency across `<truth_hierarchy>`, `<artifact_placement>`, `<node_model>`, `<assertion_model>`, `<ordering_model>`, `<verification_model>`, and `<imperfection_protocol>`. Surface any contradiction immediately. No mandatory foundation reference read follows this step.
3. Locate these operational references and list their paths without reading them until another skill needs them:
   - `${CLAUDE_SKILL_DIR}/references/excluded-nodes.md`
   - `${CLAUDE_SKILL_DIR}/references/product-domain-shapes.md`
   - `spx/local/*.md`
     Node-local `PLAN.md` and `ISSUES.md` discovery belongs to `/contextualize` after a node is in scope; never enumerate coordination notes during `/understand`.
4. Read `spx/local/merging.md` when present. Changes destined for the default branch route through `/merge`; absence of the overlay applies the default lifecycle.
5. Locate the five authoring templates and `${CLAUDE_SKILL_DIR}/examples/*.md`; read them only when authoring:
   - `${CLAUDE_SKILL_DIR}/templates/product/product-name.product.md`
   - `${CLAUDE_SKILL_DIR}/templates/decisions/decision-name.adr.md`
   - `${CLAUDE_SKILL_DIR}/templates/decisions/decision-name.pdr.md`
   - `${CLAUDE_SKILL_DIR}/templates/nodes/enabler-name.md`
   - `${CLAUDE_SKILL_DIR}/templates/nodes/outcome-name.md`
6. Read the complete root `CLAUDE.md` once when present. It routes skill invocation and carries product commands outside the managed router.
7. Emit the marker:

```text
<SPEC_TREE_FOUNDATION>
Loaded inline: truth-hierarchy, artifact-placement, node-model, assertion-model, ordering-model, verification-model, imperfection-protocol
Operational references available: excluded-nodes, product-domain-shapes
Local lifecycle route: changes route through /merge; spx/local/merging.md refines the route when present
Default-branch completion boundary: delivered value reaches the default branch on origin through /merge; verified local work remains unfinished unless explicitly limited or stopped at an explicit gate with no independent action remaining
Routing guide: loaded from CLAUDE.md | absent
Templates available: product, adr, pdr, enabler, outcome
Examples available: adr, enabler, outcome, pdr
</SPEC_TREE_FOUNDATION>
```

</workflow>

<failure_modes>

**Mandatory references made progressive disclosure fictional.**

Claude loaded `SKILL.md`, then opened six references required on every fresh invocation. One aggregate read truncated, forcing repeat reads and making the nominal overview/reference split slower than one complete payload.

Keep unconditional foundation truth inline and govern the total eager payload. Reserve references for conditional operational detail, templates, and examples.

**Higher-level truth was shaped to current code.**

Claude treated implementation incompleteness as evidence against a coherent decision. Preserve the higher declaration, align the first affected lower specs, and record concrete lower-layer work.

**A pushed branch was reported as complete.**

Claude treated a transport checkpoint as delivered value. Continue through `/merge` until the changeset reaches the default branch on origin or an explicit gate blocks every remaining independent action.

</failure_modes>

<success_criteria>

- The foundation domains and artifact-placement taxonomy are present inline and require no secondary file reads.
- Internal foundation sections contain no contradiction in truth flow, artifact ownership, node grammar, assertion selection, ordering, verification vocabulary, or imperfection handling.
- Operational references, templates, examples, overlays, and the root guide are located or read according to the workflow.
- A live `<SPEC_TREE_FOUNDATION>` marker records the inline payload.

</success_criteria>
