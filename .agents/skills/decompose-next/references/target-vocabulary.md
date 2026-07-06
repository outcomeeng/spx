<objective>
The vocabulary and classification tests for assigning current behavior to target methodology roles.
</objective>

<roles>

| Role       | Owns                                                                                                                                     | Does not own                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Substrate  | Primitive runtime, platform, process, filesystem, Git, network, hook, package, and external-service mechanics used by other roles.       | Product semantics, retained product records, user-facing command contracts, or domain workflows. |
| Capability | Reusable product behavior consumed by one or more domains, interfaces, or surfaces.                                                      | Surface binding or one-off workflow wording.                                                     |
| Domain     | Semantically composed product workflows and rules over capabilities.                                                                     | Primitive substrate mechanics or concrete rendering.                                             |
| Interface  | Stable consumption contracts over domains or capabilities, such as API shapes, protocol contracts, and projections consumed by surfaces. | Terminal text, UI layout, or command help.                                                       |
| Surface    | Concrete user-facing or consumer-facing interaction boundary: CLI, MCP, web API, UI.                                                     | Reusable semantics, persistence, verification logic, or backend implementation.                  |

</roles>

<persistence_terms>

| Term        | Meaning                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| Persistence | Durable retained data: records, journals, snapshots, caches, artifacts, and history with a retention lifecycle.       |
| Delivery    | Ephemeral projection to a surface or external venue: terminal output, PR comments, UI display, webhook message.       |
| Backend     | Adapter or implementation that realizes a capability against a substrate, such as local filesystem or GitHub Actions. |
| Node state  | Spec-tree lifecycle standing derived from declarations and evidence.                                                  |

</persistence_terms>

<outcome_terms>

| Term        | Meaning                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outcome bet | Behavior-change bet whose output is uncertain; record it as a facet attached to the substrate, capability, domain, interface, or surface that owns the bet. |

</outcome_terms>

<classification_tests>

- If behavior can be reused by multiple domains or surfaces, classify it as capability unless it is primitive substrate.
- If behavior describes a concrete command, flag, help screen, terminal rendering, or UI interaction, classify it as surface.
- If behavior defines a stable contract consumed by several surfaces, classify it as interface.
- If behavior retains records, events, snapshots, caches, or artifacts beyond a single delivery act, record a persistence facet and assign the target role from the behavior's reusable contract.
- If behavior publishes a projection to a terminal, pull request comment, UI, or response body, record a delivery facet and assign the target role from the behavior's surface or interface contract.
- If behavior carries a behavior-change bet, record an outcome-bet facet and assign the target role from the area that owns the bet.
- If behavior implements local, GitHub, or other environment-specific mechanics behind a port, classify it by the contract it implements: substrate for primitive mechanics, capability for reusable persistence or delivery adapters, or domain/interface only when the backend carries product semantics or a consumption contract.
- If behavior derives spec-tree standing, stale/fresh status, or traversal over declarations and evidence, classify it as capability and name `spec-tree` as the candidate receiver.
- If behavior coordinates validation, test, eval, audit, or review standing, classify it as domain and name `verification` as the candidate receiver.

</classification_tests>

<banned_receiver_language>

These phrases are too vague to appear as receivers:

- provider behavior
- semantic owner
- lower target area
- move to spec-tree or persistence or verification, when used as an unresolved multi-target receiver instead of a concrete receiver row with role, owned behavior, and evidence
- shared logic
- common layer
- materialization, except when quoted as current inventory or when explaining the rename to backend

Replace each phrase with a named role, receiver, and owned behavior list.

</banned_receiver_language>

<success_criteria>

- [ ] Every behavior has one role classification or is marked unresolved.
- [ ] Receiver names are concrete target destinations classified by role, not bare roles or current holding paths.
- [ ] Outcome bet, persistence, delivery, backend, and node state remain separate in every row.

</success_criteria>
