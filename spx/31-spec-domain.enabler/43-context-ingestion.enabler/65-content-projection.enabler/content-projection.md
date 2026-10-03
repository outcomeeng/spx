---
malleability: spec
---

# Content Projection

PROVIDES source-faithful Full and Digest document representations with text and JSON framing
SO THAT agents and automation consuming context
CAN receive complete working documents and concise navigation statements without generated summaries, duplicated metadata, or manifest noise

## Assertions

- A decision's Digest maps to its decision statement, the first prose paragraph after its title, at every methodology version.
- An output node's Digest maps to its opening, selected by the configured kind registry's resolved opening keyword for the node's kind.
- A product document maps to Full wherever it is projected, so no product Digest exists.

### Scenarios

- Given a selected document, when it is projected in Full, then the entry contains explicitly selected front matter followed by the complete source body ([test](tests/content.scenario.l1.test.ts))
- Given a selected document, when it is projected in Digest, then the entry contains the same selected metadata followed by the complete required Digest paragraph — a decision's decision statement or an output node's opening ([test](tests/content.scenario.l1.test.ts))

### Compliance

- ALWAYS: a missing decision statement, a missing required output-node opening, or an unresolved kind opening fails the whole projection without a title fallback or generated summary ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: front matter is recognized only by opening and closing `---` lines at the start of the file ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: front matter is selected only by named keys ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: for an output node, context projection selects only a source-present `malleability` ([test](tests/content.compliance.l1.test.ts))
- NEVER: context projection emits a default `malleability` ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: projection fails when a document's front matter is unterminated ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: projection fails when an output-node spec's terminated front matter is not valid YAML or holds a value other than a mapping ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: an output node's opening is the first paragraph beginning at column one with the case-sensitive keyword followed by one space, ending before the next blank or whitespace-only line or end of file ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: a decision statement is the first prose paragraph after the decision's title, ending before the next blank or whitespace-only line or end of file ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: every source document decodes as strict UTF-8 ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: selected source whitespace remains unchanged ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: a framing line break is added only when required to place the closing delimiter on its own line ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: text output uses ordered `spx-document` and `spx-reference` frames with one blank line between entries ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: source text matching a delimiter remains verbatim in text output ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: JSON output carries the same ordered entries, metadata, and selected source strings without text delimiters, YAML rendering, separators, or framing-only line breaks ([test](tests/content.compliance.l1.test.ts))
