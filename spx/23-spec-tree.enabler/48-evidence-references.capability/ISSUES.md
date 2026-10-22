# Known Issues: 48-evidence-references.capability

## Capability placed beneath an enabler `spx/23-spec-tree.enabler/48-evidence-references.capability/evidence-references.spec.md` `1` [`spx/23-spec-tree.enabler/21-kind-registry.adr.md`](spx/23-spec-tree.enabler/21-kind-registry.adr.md)

**Evidence:** The kind registry in `src/lib/spec-tree/config.ts` lists the admitted children of an enabler, and a capability is not among them. This capability sits beneath the `spx/23-spec-tree.enabler/` enabler. Whether assembly enforces the placement is unverified.

**Impact:** The node sits where the kind registry does not admit it, so a placement check that enforces the registry rejects it.

**Settlement condition:** The node sits where the kind registry admits it, or the registry admits a capability beneath an enabler.

## Tag position admits a closing parenthesis the assertion does not state `src/lib/spec-tree/evidence-references.ts` `58` `spx/23-spec-tree.enabler/48-evidence-references.capability/evidence-references.spec.md:ALWAYS:1`

**Evidence:** `TAG_POSITION_TAIL_PATTERN` admits one closing parenthesis after a pathless tag without requiring an opening parenthesis that encloses the tag. The assertion states the optional closing parenthesis and does not state that it closes a parenthesis enclosing the tag.

**Impact:** A line ending in `[audit])` whose parenthesis closes unrelated prose reads as tagged.

**Settlement condition:** The reader admits the closing parenthesis only when it closes a parenthesis enclosing the tag, or the assertion states that any closing parenthesis is admitted; a tag-position case shows the unrelated-prose form.

## Evidence-link target check reads whole files `src/lib/spec-tree/index.ts` `1009` `CLAUDE.md:Spec Tree Review Workflow:Performance`

**Evidence:** `readNodeEvidenceReferences` passes the evidence-link target reader a closure that calls `readText` with the link target path, and the filesystem source's `readText` reads and decodes the whole file to learn whether the target exists. `readSpecTree` performs this read for every test, eval, and probe link of every assertion of every node, on every spec-tree read. `src/validation/lint-policy.ts` line 40 answers the same kind of question with `existsSync`.

**Impact:** Every spec-tree read buffers and decodes the full content of every linked evidence file where a presence check answers the question.

**Settlement condition:** The `SpecTreeSource` contract gains a presence-only member, the filesystem source implements it without reading the file content, and the reader uses it for link targets.
