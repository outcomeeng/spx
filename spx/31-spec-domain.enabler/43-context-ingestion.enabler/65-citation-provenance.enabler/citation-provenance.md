# Citation Provenance

PROVIDES full-path decision-citation discovery over the read class — transitive scanning, citing-file provenance, and atomic failure on unsatisfied citations
SO THAT context consumers and the composition projection under `spx/31-spec-domain.enabler/43-context-ingestion.enabler`
CAN receive every governing decision a loaded document cites, with the citing paths that justify each entry, without scanning documents themselves

## Assertions

### Scenarios

- Given a read-class spec or decision cites a full-path decision absent from the structural context, when the manifest is built, then the cited decision appears exactly once as a `cited-decision` read entry carrying every citing document path, including citations discovered transitively inside cited decisions ([test](tests/cited-decisions.scenario.l1.test.ts))
- Given a read-class spec or decision cites a full-path decision that no tracked file satisfies, when the manifest is built, then the command fails naming the cited path and the citing document ([test](tests/cited-decisions.scenario.l1.test.ts))
- Given a read-class document contains a citation-shaped path carrying a relative path segment, continuing past the decision suffix, or embedding the tree root inside a longer path, when the manifest is built, then the path binds no read entry, reaches no filesystem probe, and the command succeeds ([test](tests/cited-decisions.scenario.l1.test.ts))
