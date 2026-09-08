<overview>

Product shape comes from consumers, jobs, surfaces, actors, constraints,
success signals, and top-level intent. Code organization can inform vocabulary,
constraints, and open questions, but it does not define the spec-tree structure.

This reference gives `/bootstrap` and `/decompose` the shared classifier and
examples for separating aggregate product domains, first concrete behaviors,
cases that contain one coherent concern, and code-shaped candidate areas.

</overview>

<product_dimensions>

Derive product shape from these dimensions:

- **Consumers** — the personas or systems that consume the product.
- **Job-to-be-done** — the job each consumer hires the product for.
- **Surfaces** — the interfaces where the product is consumed: web UI, CLI, API,
  library, embedded runtime, file output, or another concrete surface.
- **Actors and sidedness** — whether one party acts alone or several parties
  exchange value, such as admin and end-user, producer and consumer, buyer and
  seller, host and guest, or reviewer and author.
- **Constraints** — compliance, platform, dependency, safety, latency,
  portability, or operational requirements that shape the product contract.
- **Success signals** — the behavior change and business value the product bets
  on.
- **Top-level intent** — the major product areas that are known now, deferred, or
  unresolved.

</product_dimensions>

<shape_classifier>

Classify the input before proposing children:

| Classification          | Signal                                                                                                                                       | Structure call                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Aggregate domain        | Names a family of behavior with shared vocabulary, policy, routing, coordination, or cross-child assertions                                  | Keep or create the aggregate parent                                           |
| First concrete behavior | Names a behavior inside the aggregate with its own independently validated contract                                                          | Create a child under the aggregate in the first slice                         |
| One coherent concern    | One hypothesis or enables statement covers the assertions, and child fragments are meaningful only together                                  | Keep one node                                                                 |
| Implementation layer    | Names a package, module, file, storage table, rendering layer, parser, adapter, or other code filing concept without a spec-visible contract | Translate back to product dimensions before placing it                        |
| Unsettled boundary      | The evidence does not settle whether the concern is aggregate, concrete, or code-shaped                                                      | Invoke `/interview` with the unresolved boundary as the current coverage area |

When the aggregate and first concrete behavior are both present, create both
levels from the first slice. Put shared vocabulary, policy, routing,
coordination, and cross-child assertions on the parent. Put behavior-specific
assertions on the child. Record known later siblings or reserved horizon in
`PLAN.md`.

When the input is one coherent concern, keep it whole. Splitting creates noise
when each proposed child would carry only trivial assertions or every child needs
the others to be meaningful.

</shape_classifier>

<examples>

| Input                                                                                                                                               | Product dimensions                                                                                                                                                  | Structure call                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Add a coding-agent domain with a `resume` subcommand that finds the exact git directory or worktree and lists recent Codex and Claude Code sessions | Consumer: developer. Surface: CLI. Actors: developer and coding-agent runtimes. Aggregate: coding-agent session coordination. Concrete behavior: resume discovery   | Create a `coding-agents` parent and a `resume` child from the first slice                                                       |
| Add an admin dashboard approval queue                                                                                                               | Consumer: administrator. Surface: web UI. Actors: admin and submitter. Aggregate: administration. Concrete behavior: approval queue                                 | Create an `administration` parent when shared admin policy or future admin workflows exist; place `approval-queue` as the child |
| Add failed-invoice retry to a billing API                                                                                                           | Consumer: billing operator or upstream system. Surface: API. Aggregate: billing. Concrete behavior: invoice retry                                                   | Place `invoice-retry` under `billing` when billing owns shared payment state, policy, or cross-child assertions                 |
| Add frontmatter extraction to a document parser library                                                                                             | Consumer: library caller. Surface: library API. Aggregate: document parsing. Concrete behavior: frontmatter extraction                                              | Place `frontmatter-extraction` under `document-parsing` when later parsing behaviors share vocabulary or fixtures               |
| Export query results as CSV, with no other export formats named or implied                                                                          | Consumer: report reader. Surface: file output. Concrete behavior: CSV export                                                                                        | Keep one `csv-export` node unless an export-format family or shared export policy is already part of scope                      |
| Add host cancellation policy to a booking marketplace                                                                                               | Consumers: hosts and guests. Surface: web UI or API. Actors: host, guest, marketplace operator. Aggregate: marketplace policy. Concrete behavior: host cancellation | Place `host-cancellation-policy` under the marketplace policy area so cross-actor guarantees stay above behavior-specific rules |
| Top-level areas suggested as `parser`, `model`, and `layout` after reading a codebase                                                               | Product dimensions are missing; the names mirror code filing                                                                                                        | Re-derive from consumers, jobs, surfaces, and actors before composing children                                                  |

</examples>

<success_criteria>

- Product-shape analysis derives from consumers, jobs, surfaces, actors,
  constraints, success signals, and top-level intent.
- Aggregate domains and first concrete behaviors are separated when the
  aggregate owns shared vocabulary, policy, routing, coordination, or
  cross-child assertions and the behavior owns an independently validated
  contract.
- One coherent concern stays whole when child fragments would be trivial or
  meaningful only together.
- Code-shaped candidate areas are translated back to product dimensions before
  placement.

</success_criteria>
