---
malleability: spec
---

# Content Projection

PROVIDES source-faithful Full and Digest document representations with text and JSON framing
SO THAT agents and automation consuming context
CAN receive complete working documents and concise navigation statements without generated summaries, duplicated metadata, or manifest noise

## Assertions

### Scenarios

- Given a selected document, when it is projected, then Full contains explicitly selected front matter followed by the complete source body, and Digest contains the same selected metadata followed by the complete required Digest paragraph — a decision's decision statement or an output node's opening ([test](tests/content.scenario.l1.test.ts))

### Mappings

- Digest selects a decision's decision statement, the first prose paragraph after its title, at every methodology version, and an output node's opening by the configured kind registry's resolved opening keyword; wherever a product document is projected it is projected Full, so no product Digest exists. A missing decision statement, a missing required output-node opening, or an unresolved kind opening fails the whole projection without a title fallback or generated summary. ([test](tests/content.mapping.l1.test.ts))

### Compliance

- ALWAYS: front matter is recognized only by opening and closing `---` lines at the start of the file, selected only by named keys, and fails projection when unterminated, and context projection selects only source-present `malleability` for output nodes, never emits its default, and fails projection when an output-node spec's terminated front matter is not valid YAML or holds a value other than a mapping ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: an output node's opening is the first paragraph beginning at column one with the case-sensitive keyword followed by one space, a decision statement is the first prose paragraph after the decision's title, and each ends before the next blank or whitespace-only line or end of file ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: every source document decodes as strict UTF-8, selected source whitespace remains unchanged, and a framing line break is added only when required to place the closing delimiter on its own line ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: text output uses ordered `spx-document` and `spx-reference` frames with one blank line between entries; source text matching a delimiter remains verbatim ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: JSON output carries the same ordered entries, metadata, and selected source strings without text delimiters, YAML rendering, separators, or framing-only line breaks ([test](tests/content.compliance.l1.test.ts))
