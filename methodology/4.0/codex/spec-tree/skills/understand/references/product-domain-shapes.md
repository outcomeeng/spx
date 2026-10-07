<overview>

Product shape comes from consumers, jobs, surfaces, actors, constraints, success signals, and top-level intent. Code organization can inform vocabulary, constraints, and open questions, but it does not define the spec-tree structure.

This reference gives `/bootstrap` and `/decompose` the shared classifier and examples for separating aggregate product domains, first concrete behaviors, cases that contain one coherent concern, and code-shaped candidate areas, before the kind decision procedure in `kind-decision.md` fixes each concern's kind.

</overview>

<product_dimensions>

Derive product shape from these dimensions:

- **Consumers** — the personas or systems that consume the product.
- **Job-to-be-done** — the job each consumer hires the product for.
- **Surfaces** — the boundaries where the product is consumed: web UI, CLI, API, library, embedded runtime, file output, or another concrete surface; each is a `.surface`, and a named family of them is a family surface.
- **Actors and sidedness** — whether one party acts alone or several parties exchange value, such as admin and end-user, producer and consumer, buyer and seller, host and guest, or reviewer and author.
- **Constraints** — compliance, platform, dependency, safety, latency, portability, or operational requirements that shape the product contract.
- **Success signals** — the conditions real use settles; they become outcome records on the output nodes that move them, never nodes of their own.
- **Top-level intent** — the major product areas that are known now, deferred, or unresolved.

</product_dimensions>

<shape_classifier>

Classify the input before proposing children:

| Classification          | Signal                                                                                                                                       | Structure call                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Aggregate domain        | Names a family of behavior with shared vocabulary, rules, invariants, routing, or cross-child assertions                                     | Keep or create the `.domain` parent                                                                         |
| First concrete behavior | Names a behavior inside the aggregate with its own independently validated contract                                                          | Create a `.capability` child under the aggregate in the first slice                                         |
| One coherent concern    | One opening covers the assertions, and child fragments are meaningful only together                                                          | Keep one node                                                                                               |
| Implementation layer    | Names a package, module, file, storage table, rendering layer, parser, adapter, or other code filing concept without a spec-visible contract | Translate back to product dimensions before placing it; a primitive with no product vocabulary is substrate |
| Unsettled boundary      | The evidence does not settle whether the concern is aggregate, concrete, or code-shaped                                                      | Invoke `/interview` with the unresolved boundary as the current coverage area                               |

When the aggregate and first concrete behavior are both present, create both levels from the first slice. Put shared vocabulary, rules, invariants, and cross-child assertions on the parent. Put behavior-specific assertions on the child. Known later siblings and a reserved horizon belong to the Change that refines them, never to a node note.

When the input is one coherent concern, keep it whole. Splitting creates noise when each proposed child would carry only trivial assertions or every child needs the others to be meaningful.

</shape_classifier>

<examples>

| Input                                                                                                                                               | Product dimensions                                                                                                                                                  | Structure call                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a coding-agent domain with a `resume` subcommand that finds the exact git directory or worktree and lists recent Codex and Claude Code sessions | Consumer: developer. Surface: CLI. Actors: developer and coding agents. Aggregate: coding-agent session coordination. Concrete behavior: resume discovery           | Create a `coding-agents.domain` parent and a `resume.capability` child from the first slice; the CLI rendering stays in the `cli.surface`    |
| Add an admin dashboard approval queue                                                                                                               | Consumer: administrator. Surface: web UI. Actors: admin and submitter. Aggregate: administration. Concrete behavior: approval queue                                 | Create an `administration.domain` when shared admin policy or future admin workflows exist; place `approval-queue.capability` as the child   |
| Add failed-invoice retry to a billing API                                                                                                           | Consumer: billing operator or upstream system. Surface: API. Aggregate: billing. Concrete behavior: invoice retry                                                   | Place `invoice-retry.capability` under `billing.domain` when billing owns shared payment state, policy, or cross-child assertions            |
| Add frontmatter extraction to a document parser library                                                                                             | Consumer: library caller. Surface: library API. Aggregate: document parsing. Concrete behavior: frontmatter extraction                                              | Place `frontmatter-extraction.capability` under `document-parsing.domain` when later parsing behaviors share vocabulary or fixtures          |
| Export query results as CSV, with no other export formats named or implied                                                                          | Consumer: report reader. Surface: file output. Concrete behavior: CSV export                                                                                        | Keep one `csv-export.capability` unless an export-format family or shared export policy is already part of scope                             |
| Add host cancellation policy to a booking marketplace                                                                                               | Consumers: hosts and guests. Surface: web UI or API. Actors: host, guest, marketplace operator. Aggregate: marketplace policy. Concrete behavior: host cancellation | Place `host-cancellation-policy.capability` under the marketplace policy domain so cross-actor guarantees stay above behavior-specific rules |
| Top-level areas suggested as `parser`, `model`, and `layout` after reading a codebase                                                               | Product dimensions are missing; the names mirror code filing                                                                                                        | Re-derive from consumers, jobs, surfaces, and actors before composing children                                                               |

</examples>

<success_criteria>

- Product-shape analysis derives from consumers, jobs, surfaces, actors, constraints, success signals, and top-level intent.
- Aggregate domains and first concrete behaviors are separated when the aggregate owns shared vocabulary, rules, invariants, or cross-child assertions and the behavior owns an independently validated contract.
- One coherent concern stays whole when child fragments would be trivial or meaningful only together.
- Code-shaped candidate areas are translated back to product dimensions before placement, and every placed concern takes its kind from the ordered procedure.

</success_criteria>
