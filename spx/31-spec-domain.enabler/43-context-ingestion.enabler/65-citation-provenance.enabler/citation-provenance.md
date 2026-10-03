---
malleability: spec
---

# Citation Provenance

PROVIDES transitive decision selection from explicit citations in rendered spec and decision content
SO THAT targeted context consumers
CAN receive every selected governing decision once and diagnose an unsatisfied citation at its declaring document

## Assertions

### Scenarios

- Given selected Full content and selected Digest content, when citations are scanned, then both contribute citations and scanning follows cited decisions transitively until no unread decision remains ([test](tests/cited-decisions.scenario.l1.test.ts))
- Given cited decisions outside the structural tree walk, when the projection is composed, then they append in canonical product-root-relative path order ([test](tests/cited-decisions.scenario.l1.test.ts))

### Compliance

- ALWAYS: a decision citation is a Markdown inline link whose href is the cited decision's full path from `spx/`, ending `.adr.md` or `.pdr.md`; a `../` link, a leading-slash link, every other link destination, a bare or code-span path, coordination notes, and undisplayed source content bind no citation ([test](tests/cited-decisions.compliance.l1.test.ts))
- ALWAYS: a cited decision the structural walk also selects appears once, and repeated citations and cycles add no duplicate ([test](tests/cited-decisions.compliance.l1.test.ts))
- ALWAYS: a citation that resolves to no tracked decision fails the whole projection naming both the cited path and the citing document ([test](tests/cited-decisions.compliance.l1.test.ts))
