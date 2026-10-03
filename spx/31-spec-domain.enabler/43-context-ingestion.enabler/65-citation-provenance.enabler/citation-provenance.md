---
malleability: spec
---

# Citation Provenance

PROVIDES transitive decision selection from explicit citations in the complete source of selected spec and decision documents
SO THAT targeted context consumers
CAN receive every selected governing decision once and diagnose an unsatisfied citation at its declaring document

## Assertions

- ALWAYS: a decision citation is a Markdown inline link whose href is the cited decision's full path from `spx/`, ending `.adr.md` or `.pdr.md`
- NEVER: a `../` link, a leading-slash link, any other link destination, or a bare or code-span path binds a citation
- NEVER: a coordination note binds a citation
- ALWAYS: a cited decision the structural walk also selects appears once
- NEVER: a repeated citation or a citation cycle adds a duplicate entry
- ALWAYS: in a targeted projection, a decision reached only by citation is projected Full
- ALWAYS: the `list` entry of a decision reached only by citation records the path of every selected document that cites it
- ALWAYS: in a targeted projection, a citation that resolves to no tracked decision fails the whole projection naming both the cited path and the citing document
- NEVER: targetless discovery follows a citation
- Given a targeted projection that selects a document in Full and a document in Digest, when citations are scanned, then the complete source of each contributes citations, including Digest source beyond the displayed paragraph
- Given a targeted projection in which a cited decision itself cites another decision, when citations are scanned, then scanning follows cited decisions transitively until no unread decision remains
- Given a targeted projection with cited decisions outside the structural tree walk, when the projection is composed, then they append in canonical product-root-relative path order
