# Content Projection

PROVIDES source-faithful Full and Digest document representations with text and JSON framing
SO THAT agents and automation consuming context
CAN receive complete working documents and concise navigation statements without generated summaries, duplicated metadata, or manifest noise

## Assertions

### Scenarios

- Full contains explicitly selected front matter followed by the complete source body; Digest contains the same selected metadata followed by the complete required opening paragraph ([test](tests/content.scenario.l1.test.ts))
- When `methodology.migratingFrom` is declared and a product or decision lacks its target-version opening, Digest selects the source-version document's first prose paragraph after its title; once migration closes, the missing target-version opening fails projection ([test](tests/content.scenario.l1.test.ts))
- Text output uses ordered `spx-document` and `spx-reference` frames with one blank line between entries; source text matching a delimiter remains verbatim ([test](tests/content.scenario.l1.test.ts))
- JSON output carries the same ordered entries, metadata, and selected source strings without text delimiters, YAML rendering, separators, or framing-only line breaks ([test](tests/content.scenario.l1.test.ts))

### Compliance

- ALWAYS: front matter is recognized only by opening and closing `---` lines at the start of the file, selected only by named keys, and fails projection when unterminated; context projection selects only source-present `malleability` for output nodes and never emits its default ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: Digest selects methodology-fixed `OFFERS` for products, methodology-fixed `GOVERNS` for decisions, and the configured kind registry's resolved opening keyword for output nodes, subject only to the declared migration-source fallback; a missing required opening or unresolved kind opening fails the whole projection without a title fallback or generated summary ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: the opening is the first paragraph beginning at column one with the case-sensitive keyword followed by one space and ending before the next blank or whitespace-only line or end of file ([test](tests/content.compliance.l1.test.ts))
- ALWAYS: every source document decodes as strict UTF-8, selected source whitespace remains unchanged, and a framing line break is added only when required to place the closing delimiter on its own line ([test](tests/content.compliance.l1.test.ts))
