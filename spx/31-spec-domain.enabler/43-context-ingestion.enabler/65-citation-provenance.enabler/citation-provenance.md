# Citation Provenance

PROVIDES transitive decision selection from explicit citations in rendered spec and decision content
SO THAT targeted context consumers
CAN receive every selected governing decision once and diagnose an unsatisfied citation at its declaring document

## Assertions

### Scenarios

- Given selected Markdown content containing decision links, bare decision paths, other links, coordination-note links, and links outside selected content, when citation selection runs, then only inline links whose href begins `spx/` and ends `.adr.md` or `.pdr.md` contribute a decision citation ([test](tests/cited-decisions.scenario.l1.test.ts))
- Selected Full content and selected Digest opening paragraphs contribute citations; citation scanning follows cited decisions transitively until no unread decision remains ([test](tests/cited-decisions.scenario.l1.test.ts))
- A cited decision already selected structurally appears once, and repeated citations and cycles add no duplicate ([test](tests/cited-decisions.scenario.l1.test.ts))
- Cited decisions outside the structural tree walk append in canonical product-root-relative path order ([test](tests/cited-decisions.scenario.l1.test.ts))
- A citation that resolves to no tracked decision fails the whole projection naming both the cited path and the citing document ([test](tests/cited-decisions.scenario.l1.test.ts))
