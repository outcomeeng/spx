---
malleability: spec
---

# Citation Provenance

PROVIDES transitive decision selection from explicit citations in rendered spec and decision content
SO THAT targeted context consumers
CAN receive every selected governing decision once and diagnose an unsatisfied citation at its declaring document

## Assertions

- A decision citation is a Markdown inline link whose href begins `spx/` and ends `.adr.md` or `.pdr.md`; bare path text, other link destinations, coordination notes, and undisplayed source content contribute no citation.
- Selected Full content in a targeted projection contributes citations; targetless projections, Digest openings, and references contribute none. Citation scanning follows cited decisions transitively until no unread decision remains.
- A cited decision already selected structurally appears once, and repeated citations and cycles add no duplicate.
- Cited decisions outside the structural tree walk append in canonical product-root-relative path order.
- A citation that resolves to no tracked decision fails the whole projection naming both the cited path and the citing document.
