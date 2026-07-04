# Methodology Vocabulary

Outcome Engineering uses one methodology vocabulary for durable product maps. This product's root methodology PDRs state Outcome Engineering vocabulary as binding local methodology; every local spec uses that vocabulary consistently unless a lower decision record narrows a term through a qualified compound. Durable map, area, node type, dependency order, decision reach, assertion, evidence, state, status, persistence, records, journals, snapshots, delivery, backend, materialization, canonical suffix readiness, substrate, capability, enabler, domain, interface, composition, consumer, surface, and outcome own methodology meanings; lower specs, backends, delivery targets, and interaction boundaries consume those meanings. A reserved term admits qualified compounds that apply it to a specific artifact - a run's status, a sealed state, a source record, a tree snapshot - which specialize the methodology meaning rather than redefine it.

**Area.** A structural container that groups product truth by dependency reach. An area carries placement and ordering semantics; concrete product behavior lives in the nodes and decisions inside it.

**Substrate.** The lowest reusable operational mechanics consumed by other areas: runtime, process, filesystem, workflow, hook, and tool execution primitives. Substrate owns primitive mechanics, not product-domain semantics.

**Capability.** A stable reusable product capability consumed and composed by one or more domains, interfaces, or surfaces. A capability is specified by additive behavior and has meaning outside any one consuming domain.

**Enabler.** A node type that owns reusable capability assertions and may contain only enabler-role children. The `.enabler` suffix assigns the enabler node type. Substrate, capability, domain, interface, and surface are methodology roles carried by product specs and decisions; the filename suffix alone does not assign those roles.

**Domain.** A bounded product semantic context with its own ubiquitous language, product rules, workflows, and outcome bets. A domain composes capabilities into behavior meaningful to product users or agents.

**Interface.** A stable consumption contract that adapts one or more domains for surfaces. An interface owns resources, verbs, selectors, payload shapes, lifecycle contracts, diagnostics, and error semantics; it does not own concrete terminal, protocol, or visual rendering.

**Composition.** Interface-neutral coordination that calls provider capabilities or domains, sequences their operations, and returns surface-ready results without owning provider semantics, interface contracts, or surface rendering. Composition operations live in the area whose spec owns that coordination boundary.

**Consumer.** A person, agent, automation, external system, adapter, product area, or module that consumes a provider contract. Qualified compounds name the contract boundary being consumed, such as API consumer, persistence consumer, interface consumer, or surface consumer.

**Surface.** A concrete user-facing or consumer-facing interaction boundary, such as CLI, MCP, web, HTTP API, or UI. A surface owns surface grammar, rendering, invocation behavior, help, affordances, defaults, and presentation diagnostics.

**Outcome.** A product bet that a specified output will produce a measurable behavior change contributing to product impact. Outcomes attach to the area or semantic owner where the bet is made.

**Persistence.** Retained product artifacts and their backend addressing; a persisted artifact has a removal or garbage-collection policy. Persistence has three semantic categories:

- **Records** — primary durable records carrying query, claim, status, and retention semantics, such as changes and sessions.
- **Journals** — primary append-only event histories.
- **Snapshots** — durable views derived from another source, such as a derived current-values file like `spx.status.json`.

**Delivery.** Ephemeral projection of a result to an external, user-facing surface — a terminal, a pull-request comment, a merge-request note, or an observability sink. A delivered result survives only in that external surface; delivery persists nothing for its own sake.

**Backend.** A product boundary that provides a persistence or delivery contract through a concrete environment, such as local files, Git history, hosted artifacts, platform APIs, or hosted services. Backend is the environment-boundary term, orthogonal to the persistence categories and to delivery.

**Materialization.** The act of making a concrete product artifact available to consumers, such as a file, record, journal entry, snapshot, comment, rendered output, or hosted artifact.

**Canonical suffix readiness.** A canonical suffix is recognized consistently only when product paths using it can be authored, validated, loaded into context, projected into status, rendered by product surfaces, and interpreted compatibly with the active naming schema. The `.enabler` and `.outcome` suffixes are admitted node types; `.substrate`, `.domain`, `.interface`, and `.surface` are reserved role suffixes and are not valid node types without this readiness. The `.capability` suffix is historical grammar vocabulary, not a reserved future node suffix.

**State.** An evidence-derived lifecycle standing — for a node, declared, specified, failing, or passing; for another artifact carrying a lifecycle, a qualified standing such as a run's terminal state or a journal's sealed state. State is a lifecycle standing, not the persistence that stores it.

**Status.** A label mapped into product state, query, and selection semantics — a read-back of a lifecycle standing or a backend-owned label, staying backend-qualified when it belongs to one backend.

## Rationale

Shared methodology vocabulary lets products map local mechanics into one Outcome Engineering model instead of redefining that model per storage format, projection target, command family, agent workflow, or interaction surface. Separating substrate, capabilities, domains, interfaces, and surfaces keeps operational mechanics, reusable capability, product semantics, consumption contracts, and concrete presentation from collapsing into one placement decision. Separating persistence, delivery, and backend keeps a retained artifact's category, its projection to an external surface, and the environment-boundary providing either contract from collapsing into one term. Admitting qualified compounds lets a lower spec name a run's status or a tree snapshot without minting a rival base definition.

## Product properties

1. A methodology term has one owning definition; lower specs, backends, delivery targets, surfaces, and workflow notes use that definition as methodology vocabulary, and a qualified compound specializes that definition rather than redefining the base term.
2. Substrate, capability, domain, interface, and surface are distinct area placement terms; enabler and outcome are node-type terms. A spec names the provider area or node type that owns its semantics rather than the consumer area that exposes them.
3. Persistence, delivery, and backend are orthogonal: a spec addresses a persistence category (records, journals, or snapshots) or a delivery separately from the backend providing that contract, and a backend-owned status label maps into shared state, status, query, and selection semantics with backend qualification when it belongs to one backend.

## Verification

### Audit

- ALWAYS: specs, decisions, and coordination notes that introduce methodology terms use this vocabulary or change an owning methodology decision that lower layers consume ([audit])
- ALWAYS: specs and decisions distinguish substrate, capability, domain, interface, and surface semantics as the basis for assigning ownership to a node or area ([audit])
- ALWAYS: a spec or decision addressing a persisted or delivered artifact distinguishes its persistence category (records, journals, or snapshots) or its delivery from the backend providing that contract, and from the volatile node state its evidence derives ([audit])
- ALWAYS: backend and surface specs distinguish a backend-owned status label from backend-neutral product state, query predicates, and selection semantics, keeping the label backend-qualified when it belongs to one backend ([audit])
- NEVER: a backend, CLI command family, session command, hosted API, MCP interface, UI, delivery target, or node-local coordination note redefines the base meaning of any term this decision reserves ([audit])
