---
id: 01a1544a-a86d-7d78-b38c-b81076b8641f
---

# Evidence References

PROVIDES the evidence references a node spec declares — each tagged assertion's verification type, key, and, for a link, whether its target resolves — read from the spec into the tree snapshot
SO THAT every consumer that reports, selects, or projects verification results by assertion
CAN key a result by the audit rule slug or the node-local evidence path its assertion declares, without parsing spec text itself

## Assertions

- Given a node spec whose assertions carry `[test](path)`, `[eval](path)`, and `[probe](path)` links and `[audit:{rule-slug}]` tags, when `readSpecTree` runs, then the node carries one evidence reference per tagged assertion, keyed by the resolved node-local path for a link and by the rule slug for an audit tag
- A link target the source reads maps to a resolved reference and an absent target maps to a dangling reference, and neither is a read failure
- For every generated node spec, the evidence references of its node equal its tagged assertions in order of appearance, one each
- ALWAYS: a pathless `[audit]` tag and the legacy `[review]` tag read as unkeyed audit references
- NEVER: a spec holding two audit tags with one rule slug reads successfully; the read fails naming the spec and the slug
- ALWAYS: the tag and link-text vocabulary the reader matches comes from the link grammar's declarations in `src/lib/spec-tree/link-grammar.ts` ([audit])
