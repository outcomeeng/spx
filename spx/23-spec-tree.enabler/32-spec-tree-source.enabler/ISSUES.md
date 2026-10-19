# Known Issues: 32-spec-tree-source.enabler

## f-001: The evidence case composes a negative name that no statement of this node selects

The evidence case of [`spx/23-spec-tree.enabler/32-spec-tree-source.enabler/tests/spec-tree-source.mapping.l1.test.ts`](spx/23-spec-tree.enabler/32-spec-tree-source.enabler/tests/spec-tree-source.mapping.l1.test.ts) (the `SPEC_TREE_ENTRY_TYPE.EVIDENCE` branch, lines 86 to 111) writes one negative name inline at lines 91 to 94: the first evidence file name with `testCase.form.productSuffix` appended, written through `env.writeRaw`. Line 99 then expects only the evidence files without that suffix to be recognized, so the case asserts that the suffixed name is not an evidence entry. No statement of [`spx/23-spec-tree.enabler/32-spec-tree-source.enabler/spec-tree-source.md`](spx/23-spec-tree.enabler/32-spec-tree-source.enabler/spec-tree-source.md) selects that rule: its first mapping covers co-located test evidence files mapping to linked evidence entries, and says nothing about an evidence name carrying the product suffix. The rule that decides which evidence file names the grammar accepts belongs to [`spx/23-spec-tree.enabler/29-filename-grammar.enabler/filename-grammar.md`](spx/23-spec-tree.enabler/29-filename-grammar.enabler/filename-grammar.md).

**Impact:** The case holds evidence for a rule outside this node's declaration, so the test fails or passes on grammar behavior this node does not own, and the rule's owner holds no evidence of it.

**Settlement condition:** The negative case lives in the evidence of `spx/23-spec-tree.enabler/29-filename-grammar.enabler`, or the case no longer composes it.
