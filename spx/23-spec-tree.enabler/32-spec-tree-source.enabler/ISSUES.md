# Known Issues: 32-spec-tree-source.enabler

## f-001: The evidence case composes a negative name that no statement of this node selects

The evidence case of [`spx/23-spec-tree.enabler/32-spec-tree-source.enabler/tests/spec-tree-source.mapping.l1.test.ts`](spx/23-spec-tree.enabler/32-spec-tree-source.enabler/tests/spec-tree-source.mapping.l1.test.ts) (the `SPEC_TREE_ENTRY_TYPE.EVIDENCE` branch, lines 86 to 111) writes one negative name inline at lines 91 to 94: the first evidence file name with `testCase.form.productSuffix` appended, written through `env.writeRaw`. Line 99 then expects only the evidence files without that suffix to be recognized, so the case asserts that the suffixed name is not an evidence entry. No statement of [`spx/23-spec-tree.enabler/32-spec-tree-source.enabler/spec-tree-source.md`](spx/23-spec-tree.enabler/32-spec-tree-source.enabler/spec-tree-source.md) selects that rule: its first mapping covers co-located test evidence files mapping to linked evidence entries, and says nothing about an evidence name carrying the product suffix. The rule that decides which evidence file names the grammar accepts belongs to [`spx/23-spec-tree.enabler/29-filename-grammar.enabler/filename-grammar.md`](spx/23-spec-tree.enabler/29-filename-grammar.enabler/filename-grammar.md).

**Impact:** The case holds evidence for a rule outside this node's declaration, so the test fails or passes on grammar behavior this node does not own, and the rule's owner holds no evidence of it.

**Settlement condition:** The negative case lives in the evidence of `spx/23-spec-tree.enabler/29-filename-grammar.enabler`, or the case no longer composes it.

## f-002: The grammar-selection oracle is a hand-authored expectation with no stated provenance

`testing/fixtures/spec-tree/grammar-selection/four-line/expected.json` is a hand-authored classification of the inert `four-line` fixture tree beside it. It lists `gradient.spec.md` as the product, three names as `valid` (`10-ledger.substrate`, `20-routing.domain`, `30-console.surface`), two as `superseded` (`40-archive.enabler`, `50-metrics.outcome`), and none as `invalid`. The harness `testing/harnesses/spec-tree/grammar-selection.ts` reads the file as the fixture's expectation (lines 7 and 65). The audit judged the oracle independent of the implementation under test. The grammar-selection statements in [`spx/23-spec-tree.enabler/spec-tree.md`](spx/23-spec-tree.enabler/spec-tree.md) (lines 16 to 20) cite the scenarios that consume the fixture but state nowhere how the oracle's classification is derived.

**Impact:** A reader cannot tell what makes the oracle's classification correct, so a change to the fixture tree or to the grammar leaves no stated basis for deciding whether `expected.json` or the implementation is wrong.

**Settlement condition:** The grammar-selection spec states the oracle's provenance.
