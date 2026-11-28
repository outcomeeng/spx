---
id: 01a1544a-a86d-7d78-b38c-b81076b8641f
---

# Evidence References

PROVIDES the leading slug that opens each Assertion of a node spec and each decision rule of a decision record, and the evidence references a node spec declares — each reference's verification type and key, read from an assertion's evidence tag or from a 4.0 row's slug link or Audit group, and, for a link, whether its target resolves — read from the spec into the tree snapshot
SO THAT every consumer that reports, selects, validates, or projects verification results by assertion
CAN key a result by the leading slug of an Audit Assertion, the rule slug of an audit tag, or the node-local evidence path its assertion declares, and judge each leading slug, without parsing spec text itself

## Assertions

- For every generated node spec, the evidence references of its node equal its tagged assertions in order of appearance, one each ([test](tests/evidence-references.property.l1.test.ts))
- A link target the source reads maps to a resolved reference and an absent target maps to a dangling reference; neither outcome is a read failure, and a `readText` rejection that is not a file-not-found rejection stays a read failure ([test](tests/evidence-references.mapping.l1.test.ts))
- For each methodology declaration a product can make, a path segment of a link target names a descendant node exactly when the declared grammar accepts it as a node directory, and the link resolves or dangles under that classification ([test](tests/evidence-references.mapping.l1.test.ts))
- Given a source that exposes no `readText`, when `readSpecTree` runs, then every node carries no evidence references ([test](tests/evidence-references.scenario.l1.test.ts))
- NEVER: a spec holding two audit tags with one rule slug reads successfully; the read fails naming the spec and the slug ([test](tests/evidence-references.compliance.l1.test.ts))
- ALWAYS: the tag and link-text vocabulary the reader matches comes from the link grammar's declarations in `src/lib/spec-tree/link-grammar.ts` ([audit])

### Test.Mapping: [tag-forms](tests/evidence-references.mapping.l1.test.ts)

Each evidence tag form on an assertion line maps to one evidence reference by the grammars the methodology declaration selects: a test, eval, or probe link maps alike under every declaration, and an audit or review tag maps only under a declaration that selects the 3.x grammar.

| Case           | Tag on the line                                      | Declaration selects the 3.x grammar             | Declaration selects the 4.0 grammar alone       |
| -------------- | ---------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| test-link      | a `test` link to `tests/capture.scenario.l1.test.ts` | test, keyed `tests/capture.scenario.l1.test.ts` | test, keyed `tests/capture.scenario.l1.test.ts` |
| eval-link      | an `eval` link to `evals/capture-title/eval.toml`    | eval, keyed `evals/capture-title/eval.toml`     | eval, keyed `evals/capture-title/eval.toml`     |
| probe-link     | a `probe` link to `probes/capture/probe.md`          | probe, keyed `probes/capture/probe.md`          | probe, keyed `probes/capture/probe.md`          |
| linked-audit   | an `audit` link to `audits/recovery-message.md`      | audit, keyed `recovery-message`                 | none                                            |
| slugged-audit  | an audit tag of rule slug `recovery-message`         | audit, keyed `recovery-message`                 | none                                            |
| pathless-audit | an audit tag with no rule slug                       | audit, unkeyed                                  | none                                            |
| legacy-review  | a review tag with no link                            | audit, unkeyed                                  | none                                            |

### Test.Mapping: [leading-slug](tests/leading-slug.mapping.l1.test.ts)

The leading-slug reader maps each line of a node spec or decision record, of either file form, to the leading slug it opens: a row is a list item that starts its line outside a fenced code block and opens with a slug in the methodology's slug grammar, plain or as the text of a link, then a colon at the end of the line or before a space, and a Mapping or Evaluate heading carries the slug of its subsection; every other line maps to none, and no line fails the read.

| Case                   | Line                                                                                       | Leading slug     |
| ---------------------- | ------------------------------------------------------------------------------------------ | ---------------- |
| plain-row              | `- line-verbatim: NEVER: a task drops a character.`                                        | `line-verbatim`  |
| linked-row             | `- [line-verbatim](tests/capture.compliance.l1.test.ts): NEVER: a task drops a character.` | `line-verbatim`  |
| scenario-row           | `- capture-basic:`, its step lines below it                                                | `capture-basic`  |
| digit-in-word          | `- retry-in5s: ALWAYS: a failed capture retries.`                                          | `retry-in5s`     |
| digit-led-word         | `- retry-in-5s: ALWAYS: a failed capture retries.`                                         | none             |
| reserved-word          | `- title: ALWAYS: a task keeps its title.`                                                 | `title`          |
| mapping-heading        | `### Test.Mapping: priority-order`                                                         | `priority-order` |
| linked-mapping-heading | `### Test.Mapping: [priority-order](tests/priority.mapping.l1.test.ts)`                    | `priority-order` |
| evaluate-heading       | `### Evaluate: capture-title`                                                              | `capture-title`  |
| keyword-row            | `- ALWAYS: a submitted line yields a task.`                                                | none             |
| prose-row              | `- Given a node, when it is read, then it reports its state`                               | none             |
| step-line              | `- Given the line "buy milk"`, indented two spaces under a Scenario row                    | none             |
| group-heading          | `### Test.Compliance: capture`                                                             | none             |
| no-space               | `- line-verbatim:NEVER: a task drops a character.`                                         | none             |
| digit-first-word       | `- capture-2fa: ALWAYS: a code is asked once.`                                             | none             |
| uppercase              | `- Line-verbatim: NEVER: a task drops a character.`                                        | none             |
| double-hyphen          | `- line--verbatim: NEVER: a task drops a character.`                                       | none             |
| fenced-row             | `- line-verbatim: NEVER: a task drops a character.` inside a fenced code block             | none             |

### Test.Mapping: [row-references](tests/row-references.mapping.l1.test.ts)

Under a methodology declaration that selects the 4.0 grammar, an untagged row or a Mapping or Evaluate heading of a node spec of either file form maps to at most one evidence reference: a slug linked to a test file, eval rule, or probe protocol maps to a reference of that verification type keyed by its node-local path, which resolves or dangles as a tag's link target does, and a plain leading slug under a group heading that reads `Audit` or `Audit: <subject>`, at any heading level, maps to an audit reference keyed by that slug; under a declaration that selects only the 3.x grammar, no such row or heading maps to a reference.

| Case                | Row or heading                                                                                          | Group heading                  | Declaration             | Reference                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------- | ----------------------------------------------------- |
| test-slug-link      | `- [capture-basic](tests/capture.scenario.l1.test.ts):`                                                 | `### Test.Scenario: capture`   | 4.0                     | test, keyed `tests/capture.scenario.l1.test.ts`       |
| mapping-slug-link   | `### Test.Mapping: [priority-order](tests/priority.mapping.l1.test.ts)`                                 | the heading itself             | 4.0                     | test, keyed `tests/priority.mapping.l1.test.ts`       |
| evaluate-slug-link  | `### Evaluate: [capture-title](evals/capture-title/eval.toml)`                                          | the heading itself             | 4.0                     | eval, keyed `evals/capture-title/eval.toml`           |
| probe-slug-link     | `- [representative-capture](probes/representative-capture/probe.md): the capture field keeps the line.` | `### Probe: capture`           | 4.0                     | probe, keyed `probes/representative-capture/probe.md` |
| plain-test-row      | `- line-verbatim: NEVER: a task drops a character.`                                                     | `### Test.Compliance: capture` | 4.0                     | none                                                  |
| audit-row           | `- recovery-message: ALWAYS: the message names the line.`                                               | `### Audit`                    | 4.0                     | audit, keyed `recovery-message`                       |
| audit-subject-row   | `- recovery-message: ALWAYS: the message names the line.`                                               | `### Audit: messages`          | 4.0, migrating from 3.2 | audit, keyed `recovery-message`                       |
| unslugged-audit-row | `- ALWAYS: the message names the line.`                                                                 | `### Audit`                    | 4.0                     | none                                                  |
| three-x-heading     | `- recovery-message: ALWAYS: the message names the line.`                                               | `### Compliance`               | 4.0                     | none                                                  |
| three-x-declaration | `- recovery-message: ALWAYS: the message names the line.`                                               | `### Audit: messages`          | 3.2                     | none                                                  |

### Test.Compliance: evidence tags

- [first-real-tag](tests/evidence-references.compliance.l1.test.ts): ALWAYS: an assertion line yields at most one evidence reference: for its first real evidence tag the one the `tag-forms` Mapping states, and, when it holds none, only the one the `row-references` Mapping states; a real tag is a link tag with a path or an audit tag with a slug anywhere on the line outside a code span, or an audit tag without a slug or a legacy review tag followed on the line by nothing beyond an optional closing parenthesis and an optional sentence-final period; bracketed text elsewhere in an assertion is prose

### Audit: slug grammar

- slug-grammar-owner: ALWAYS: the slug grammar and the row and heading openings the leading-slug reader matches are declared once in the spec-tree library and exported from `src/lib/spec-tree/index.ts`; node status and markdown validation take leading slugs and audit references from that library and declare no slug or audit-tag pattern of their own
