---
id: 01a1544a-a86d-7d78-b38c-b81076b8641f
---

# Evidence References

PROVIDES the evidence references a node spec declares — each tagged assertion's verification type, key, and, for a link, whether its target resolves — read from the spec into the tree snapshot
SO THAT every consumer that reports, selects, or projects verification results by assertion
CAN key a result by the audit rule slug or the node-local evidence path its assertion declares, without parsing spec text itself

## Assertions

- Each tag form maps to one evidence reference: a test, eval, or probe link maps to a reference of that verification type keyed by its node-local path; an audit tag with a rule slug maps to a reference of verification type audit keyed by the slug; an audit tag without a slug and the legacy review tag map to a reference of verification type audit with no key ([test](tests/evidence-references.mapping.l1.test.ts))
- For every generated node spec, the evidence references of its node equal its tagged assertions in order of appearance, one each ([test](tests/evidence-references.property.l1.test.ts))
- A link target the source reads maps to a resolved reference and an absent target maps to a dangling reference; neither outcome is a read failure, and a `readText` rejection that is not a file-not-found rejection stays a read failure ([test](tests/evidence-references.mapping.l1.test.ts))
- For each methodology declaration a product can make, a path segment of a link target names a descendant node exactly when the declared grammar accepts it as a node directory, and the link resolves or dangles under that classification ([test](tests/evidence-references.mapping.l1.test.ts))
- Given a source that exposes no `readText`, when `readSpecTree` runs, then every node carries no evidence references ([test](tests/evidence-references.scenario.l1.test.ts))
- ALWAYS: an assertion line yields one evidence reference, for its first real evidence tag, and no reference when it holds none; a real tag is a link tag with a path or an audit tag with a slug anywhere on the line outside a code span, or an audit tag without a slug or a legacy review tag followed on the line by nothing beyond an optional closing parenthesis and an optional sentence-final period; bracketed text elsewhere in an assertion is prose ([test](tests/evidence-references.compliance.l1.test.ts))
- NEVER: a spec holding two audit tags with one rule slug reads successfully; the read fails naming the spec and the slug ([test](tests/evidence-references.compliance.l1.test.ts))
- ALWAYS: the tag and link-text vocabulary the reader matches comes from the link grammar's declarations in `src/lib/spec-tree/link-grammar.ts` ([audit])
