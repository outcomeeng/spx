# Known Issues: 43-entry-recognition.enabler

## Assertion predicates live in shared harnesses

`tests/version-classification.property.l1.test.ts`, `tests/version-classification.compliance.l1.test.ts`, and `tests/evidence-recognition.property.l1.test.ts` call harness functions whose bodies hold the `expect` calls: `assertCanonicalVersionNameMapsToValidEntry` and its siblings in `testing/harnesses/spec-tree/naming-schema-version.ts`, and `assertProductEntryRecognition`, `assertEvidenceRecognitionProperty`, and the recognition registrations in `testing/harnesses/spec-tree/filename-grammar.ts`. `expectPresent` in `testing/harnesses/spec-tree/assertions.ts` holds two more.

**Evidence:** `grep -n "expect(" testing/harnesses/spec-tree/naming-schema-version.ts testing/harnesses/spec-tree/filename-grammar.ts testing/harnesses/spec-tree/assertions.ts`.

**Impact:** a harness that owns the predicate can serve only the claim it asserts, and the linked test file shows no predicate to an auditor.

**Settlement condition:** each assertion's `expect` calls sit in its linked test; the harness functions return the recognized entry and the generated scenario.

## The newest-version clause of the superseded property has no case with several prior versions

The property "maps to a superseded entry that names the newest such version it matched" runs `recognitionScenario`, whose tuple holds one prior version beside the target. Every case has one candidate version, so a recognizer that returns the oldest matching version passes. The same scenarios use fixture identifiers `0.1.0` and `0.2.0`, not the forms the 3.2 and 4.0 lines select.

**Evidence:** `RECOGNITION_SCENARIO_VERSION` and `arbitraryRecognitionVersionScenario` in `testing/generators/spec-tree/naming-schema-version.ts`; `newestSupersededVersionCases` in the same module supplies an ordered-tuple case list that presents the clause.

**Impact:** a defect that selects the wrong prior version in `recognizeSpecTreeFilesystemEntry` is undetected at this node.

**Settlement condition:** the superseded property draws a tuple with several prior versions accepting one suffix and a later version accepting it too, and asserts the newest prior version; the classification properties declare 3.2 and 4.0 lines.

## Grammar vocabulary is written as literals in the recognition harness and generators

`testing/harnesses/spec-tree/naming-schema-version.ts` builds `${order}-${slug}${suffix}`, `testing/harnesses/spec-tree/filename-grammar.ts` joins the root directory and the relative path with `/` in `assertProductEntryRecognition`, and `testing/generators/spec-tree/migration-classification.ts` declares `NAME_SEPARATOR = "-"`; `SPEC_TREE_GRAMMAR.ORDER.SEPARATOR` and `SPEC_TREE_GRAMMAR.PATH_SEPARATOR` own these values.

**Evidence:** the three lines above.

**Impact:** a change to the grammar's separators leaves these fixtures and expectations on the old value.

**Settlement condition:** the harness and generator import both separators from `SPEC_TREE_GRAMMAR`.
