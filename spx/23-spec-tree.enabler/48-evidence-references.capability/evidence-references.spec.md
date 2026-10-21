---
id: 01a1544a-a86d-7d78-b38c-b81076b8641f
---

# Evidence References

PROVIDES the evidence references a node spec declares — each tagged assertion's verification type, key, and, for a link, whether its target resolves — read from the spec into the tree snapshot
SO THAT every consumer that reports, selects, or projects verification results by assertion
CAN key a result by the audit rule slug or the node-local evidence path its assertion declares, without parsing spec text itself

## Assertions

- Given a node spec whose assertions carry test, eval, and probe links and keyed audit tags, when `readSpecTree` runs, then the node carries one evidence reference per tagged assertion, keyed by the resolved node-local path for a link and by the rule slug for an audit tag ([test](tests/evidence-references.scenario.l1.test.ts))
- A link target the source reads maps to a resolved reference and an absent target maps to a dangling reference, under the grammar selection and entry classification the snapshot already resolved for the product's declared methodology, so a path segment names a descendant node only when the declared grammar accepts it as one; neither outcome is a read failure; a `readText` rejection that is not a file-not-found rejection stays a read failure ([test](tests/evidence-references.mapping.l1.test.ts))
- Given a source that exposes no `readText`, when `readSpecTree` runs, then every node carries no evidence references ([test](tests/evidence-references.scenario.l1.test.ts))
- For every generated node spec, the evidence references of its node equal its tagged assertions in order of appearance, one each ([test](tests/evidence-references.property.l1.test.ts))
- ALWAYS: a pathless audit tag and the legacy review tag read as unkeyed audit references only in the tag position at the end of the assertion line, while a link tag with a path and an audit tag with a slug read as tags anywhere on the line outside a code span; bracketed text elsewhere in an assertion is prose ([test](tests/evidence-references.compliance.l1.test.ts))
- NEVER: a spec holding two audit tags with one rule slug reads successfully; the read fails naming the spec and the slug ([test](tests/evidence-references.compliance.l1.test.ts))
- ALWAYS: the tag and link-text vocabulary the reader matches comes from the link grammar's declarations in `src/lib/spec-tree/link-grammar.ts` ([audit])
