---
malleability: spec
---

# Context Ingestion

PROVIDES deterministic Product Tree discovery and context delivery for CLI consumers
SO THAT agents and developers requesting work context
CAN first locate relevant subtrees and then load only the product truth required for one or more accepted targets through a structural `list` manifest or source-faithful `show` entries, with optional methodology foundation

## Assertions

- Given a Product Tree, when `spx spec context list <targets...>` runs, then it emits the versioned structural manifest
- Given a Product Tree, when `spx spec context show [targets...]` runs, then it emits selected document content and path references without manifest fields
- Given no target, when `spx spec context show` runs, then it supplies the complete product spec and a depth-bounded Product Tree map from which an agent can choose a target
- Given one or more targets, when `spx spec context show` runs, then it supplies Full target and ancestor context, Digest sibling and immediate-child awareness, applicable decisions, and path-only references to each `ISSUES.md` on a target path and to each explicit target's `knowledge/index.md`
- Given one or more targets, when `spx spec context list` runs, then the manifest it emits carries the schema version and the bootstrap flag [spx/31-spec-domain.enabler/43-context-ingestion.enabler/32-context-manifest-schema.pdr.md](spx/31-spec-domain.enabler/43-context-ingestion.enabler/32-context-manifest-schema.pdr.md) declares, and `list` emits that manifest as labelled text and, with `--json`, as the equivalent JSON
- The manifest carries the configured methodology identity: each accepted version form resolves, text `list` labels the methodology source with its version and, while a migration is open, the migration source version, each rendered as `MAJOR.MINOR` whichever accepted form configuration declares, and `list --json` carries each version exactly as product configuration declares it.
- ALWAYS: the executable writes no partial context to stdout after any target, source, citation, or methodology failure
- Equal tracked product content, shipped methodology content, options, selected coding agent, and accepted canonical targets produce byte-identical output.
- ALWAYS: context ingestion resolves the complete projection before output, so any target, selected-document, source, citation, or methodology failure returns a failure carrying no partial projection

### Compliance

- ALWAYS: context selection is structural and never uses keyword search, semantic similarity, or LLM judgment ([audit])
- ALWAYS: for each probed call in spx's own tree, the entries `show` delivers equal, entry by entry, the context-loading read set the context-fidelity protocol computes for that call's requested targets independently of `show` in path, projection mode, content bytes, selected metadata, and position, where each requested target's read set is its own — each ancestor level on its path contributing only the decisions at a lower index than the child the path continues through, its siblings and immediate children contributing their Digest opening, `ISSUES.md` and knowledge contributing by path, and harness guides and `spx/local/` overlays staying outside — and a call naming several targets takes each entry once at the highest mode any of its targets' read sets requires; any other difference fails ([probe](probes/context-fidelity/probe.md))
- ALWAYS: for each probed call naming one or more explicit targets in spx's own tree, the entries `list` delivers equal, entry by entry, that independently computed read set in path, projection mode, selection reasons, and position, where each requested target records its own selection reason for each entry its read set holds; any other difference fails ([probe](probes/context-fidelity/probe.md))
- ALWAYS: two runs of the context-fidelity protocol at one commit produce identical `show` and `list` output for every probed target ([probe](probes/context-fidelity/probe.md))
