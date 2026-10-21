# Known Issues: 48-evidence-references.capability

## Capability placed beneath an enabler `spx/23-spec-tree.enabler/48-evidence-references.capability/evidence-references.spec.md` `1` [`spx/23-spec-tree.enabler/21-kind-registry.adr.md`](spx/23-spec-tree.enabler/21-kind-registry.adr.md)

**Evidence:** The kind registry in `src/lib/spec-tree/config.ts` lists the admitted children of an enabler, and a capability is not among them. This capability sits beneath the `spx/23-spec-tree.enabler/` enabler. Whether assembly enforces the placement is unverified.

**Impact:** The node sits where the kind registry does not admit it, so a placement check that enforces the registry rejects it.

**Settlement condition:** The node sits where the kind registry admits it, or the registry admits a capability beneath an enabler.

## Tag position admits a closing parenthesis the assertion does not state `src/lib/spec-tree/evidence-references.ts` `58` `spx/23-spec-tree.enabler/48-evidence-references.capability/evidence-references.spec.md:ALWAYS:1`

**Evidence:** `TAG_POSITION_TAIL_PATTERN` admits one closing parenthesis after a pathless tag, while the assertion places the tag at the end of the line.

**Impact:** A line ending in `[audit])` that closes an unrelated parenthesis reads as tagged.

**Settlement condition:** The assertion states the optional enclosing parenthesis, and a tag-position case shows the parenthesized form reads as a tag.
