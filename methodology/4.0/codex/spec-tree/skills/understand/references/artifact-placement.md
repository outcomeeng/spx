<overview>

The boundary between executable assertion files and the production infrastructure they consume, and the placements the foundation's taxonomy rules out. `/author`, `/verify`, `/test`, and the audit skills read this reference when they place an artifact.

</overview>

<test_artifact_boundaries>

- ALWAYS: keep executable assertion files separate from the production infrastructure they consume.

Files under `spx/<node>/tests/` contain typed assertion evidence only. Harnesses mediate systems, generators produce variable domains, and fixtures are inert whole-payload inputs read by path. These artifacts are governed production code in the location declared by the active language's test standards, outside `spx/` and every `tests/` directory, owned by the output node whose behavior they mediate or produce. Never fabricate a top-level infrastructure-testing subtree solely because test infrastructure exists. Avoid the anti-terms “test support,” “test helpers,” “test utilities,” and “test tools,” which hide governed production behavior behind an unowned utility category.

Enforcement rules are production validation code. Their `[test]` evidence runs the rule against violating fixtures and proves detection; a green validation pipeline separately proves registration.

</test_artifact_boundaries>

<common_misplacements>

- NEVER: preserve content in an artifact whose purpose does not own it.

An architecture choice belongs in an ADR and a product guarantee in a PDR, never in a spec. A condition only real use settles belongs in the outcome record, never in a spec or decision; a measured value or threshold belongs in the linked metric source, never in the record. A test reference belongs in a spec assertion, never in a decision. An enforceable static constraint is a `[test]` on the enforcement rule, never an `[audit]`. A behavior spanning children belongs to their lowest common output-kind ancestor, and one spanning a product's children to a common output-kind child, never to the product. A decision governing one subtree belongs in that node, never at the root. Pending work belongs in a Change; a known defect in `ISSUES.md` with a settlement condition; dated learning in the owning node's knowledge root. A parent never enumerates its children; a harness, generator, or fixture never lives in an executed test file.

Evidence specialization is valid when a child `[test]` rule concretizes an ancestor `[audit]` rule against a narrower source surface. Same-content repetition using the same evidence mechanism is duplication.

</common_misplacements>
